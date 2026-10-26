from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from services.guest_usage_service import verify_guest_token

from dependencies import get_conversation_manager, get_request_identity
from services.guest_usage_service import consume_rate
from schemas.conversations import ConversationCreateRequest, ConversationUpdateRequest
from services.conversation_service import (
    create_conversation,
    delete_conversation,
    get_conversation_messages,
    list_conversations,
    update_conversation_title,
)

router = APIRouter(tags=["conversations"])


async def read_history(db, identity, conversation_id=None):
    result = await db.read_owned_history(identity, conversation_id)
    if result is None:
        # Rolling deploy: preserve the existing protected path until SQL 006.
        await consume_rate(db, identity, 'conversations', 60)
        return (await list_conversations(db, identity.user_id) if conversation_id is None
                else await get_conversation_messages(db, identity.user_id, conversation_id))
    code = result['code']
    if code == 'RATE_LIMITED':
        raise HTTPException(429, {'detail': 'Too many requests. Please try again later.', 'code': code})
    if code == 'NOT_FOUND':
        raise HTTPException(404, 'Conversation not found')
    if code != 'OK':
        raise HTTPException(503, 'Unable to read conversation history')
    return {key: value for key, value in result.items() if key != 'code'}


class GuestHistoryClaim(BaseModel):
    guest_token: str = Field(min_length=1, max_length=1024)


@router.post('/conversations/claim-guest')
async def claim_guest_history_route(req: GuestHistoryClaim,
    db=Depends(get_conversation_manager), identity=Depends(get_request_identity)):
    if identity.is_guest:
        raise HTTPException(401, 'Sign in to claim guest history')
    guest = verify_guest_token(req.guest_token)
    result = await db.claim_guest_history(guest, identity.user_id)
    status = result.get('status')
    if status != 'claimed':
        raise HTTPException(403 if status == 'subscription_required' else 409,
            {'code': 'GUEST_CLAIM_' + str(status).upper(),
             'detail': 'Guest history cannot be transferred yet. Please retry.'})
    return result


@router.get("/conversations")
async def list_conversations_route(
    db=Depends(get_conversation_manager),
    identity=Depends(get_request_identity),
):
    return await read_history(db, identity)


@router.post("/conversations")
async def create_conversation_route(
    req: ConversationCreateRequest,
    db=Depends(get_conversation_manager),
    identity=Depends(get_request_identity),
):
    await consume_rate(db, identity, "conversations", 60)
    return await create_conversation(db, identity.user_id, req.title or "New Conversation")


@router.get("/conversations/{conv_id}")
async def get_conversation_route(
    conv_id: str,
    db=Depends(get_conversation_manager),
    identity=Depends(get_request_identity),
):
    return await read_history(db, identity, conv_id)


@router.put("/conversations/{conv_id}")
async def update_conversation_route(
    conv_id: str,
    req: ConversationUpdateRequest,
    db=Depends(get_conversation_manager),
    identity=Depends(get_request_identity),
):
    await consume_rate(db, identity, "conversations", 60)
    return await update_conversation_title(db, identity.user_id, conv_id, req.title)


@router.delete("/conversations/{conv_id}")
async def delete_conversation_route(
    conv_id: str,
    db=Depends(get_conversation_manager),
    identity=Depends(get_request_identity),
):
    await consume_rate(db, identity, "conversations", 60)
    return await delete_conversation(db, identity.user_id, conv_id)
