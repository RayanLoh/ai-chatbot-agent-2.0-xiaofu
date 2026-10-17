import base64
import hashlib
import hmac
import json
import time
import uuid
from dataclasses import dataclass
from fastapi import HTTPException, Request
from config import Config


@dataclass(frozen=True)
class RequestIdentity:
    user_id: str
    is_guest: bool
    network_id: str


def _secret() -> bytes:
    if len(Config.GUEST_SIGNING_SECRET) < 32:
        raise HTTPException(503, 'Guest sessions are not configured')
    return Config.GUEST_SIGNING_SECRET.encode()


def network_id(request: Request) -> str:
    # Only trust ASGI's client address. Configure uvicorn's trusted proxy IPs,
    # never read arbitrary X-Forwarded-For supplied by clients here.
    address = request.client.host if request.client else 'unknown'
    return hmac.new(_secret(), address.encode(), hashlib.sha256).hexdigest()


def issue_guest_token() -> str:
    payload = base64.urlsafe_b64encode(json.dumps({
        'sub': str(uuid.uuid4()), 'exp': int(time.time()) + 30 * 86400,
    }, separators=(',', ':')).encode()).decode().rstrip('=')
    signature = hmac.new(_secret(), payload.encode(), hashlib.sha256).hexdigest()
    return f'{payload}.{signature}'


def verify_guest_token(token: str) -> str:
    try:
        if len(token) > 1024:
            raise ValueError()
        payload, signature = token.split('.')
        expected = hmac.new(_secret(), payload.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            raise ValueError()
        claims = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))
        if type(claims['exp']) is not int or claims['exp'] <= time.time():
            raise ValueError()
        return f"guest:{uuid.UUID(claims['sub'])}"
    except (ValueError, KeyError, TypeError):
        raise HTTPException(401, {'detail': 'Guest session expired. Please retry.', 'code': 'INVALID_GUEST_TOKEN'}) from None


async def consume_rate(db, identity: RequestIdentity, action: str, limit: int, window: int = 60):
    bucket = int(time.time()) // window
    # Both identity and network limits persist across application instances.
    for scope, allowance in ((identity.user_id, limit), (identity.network_id, limit * 5)):
        allowed = await db.consume_usage(f'rate:{action}:{scope}:{bucket}', allowance)
        if not allowed:
            raise HTTPException(429, {'detail': 'Too many requests. Please try again later.', 'code': 'RATE_LIMITED'})
