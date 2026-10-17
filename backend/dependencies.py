from fastapi import Depends, Request, HTTPException
import time
from starlette.concurrency import run_in_threadpool
from app_state import bot, db, storage
from services.guest_usage_service import RequestIdentity, network_id, verify_guest_token, consume_rate
from services.auth_service import extract_bearer_token, verify_google_id_token


def get_conversation_manager():
    return db


def get_storage_service():
    return storage


def get_bot_service():
    return bot


async def get_request_identity(request: Request, manager=Depends(get_conversation_manager)) -> RequestIdentity:
    bearer = extract_bearer_token(request.headers.get('Authorization'))
    network = network_id(request)
    if bearer:
        # Apply before certificate fetching or signature verification, including
        # invalid bearer tokens. Identity rate limits still apply after verify.
        if not await manager.consume_usage(f'auth-network:{network}:{int(time.time()) // 60}', 300):
            raise HTTPException(429, {'detail': 'Too many sign-in checks. Please retry.', 'code': 'RATE_LIMITED'})
        user = await run_in_threadpool(verify_google_id_token, bearer)
        identity = RequestIdentity(f'user:{user.sub}', False, network)
    else:
        token = request.headers.get('X-Guest-Token')
        if not token:
            raise HTTPException(401, {'detail': 'A guest session is required.', 'code': 'GUEST_SESSION_REQUIRED'})
        identity = RequestIdentity(verify_guest_token(token), True, network)
    await consume_rate(manager, identity, 'request', 120)
    return identity
