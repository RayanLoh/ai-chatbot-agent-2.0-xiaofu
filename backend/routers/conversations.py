from fastapi import APIRouter, Depends

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


@router.get("/conversations")
async def list_conversations_route(
    db=Depends(get_conversation_manager),
    identity=Depends(get_request_identity),
):
    await consume_rate(db, identity, "conversations", 60)
    return await list_conversations(db, identity.user_id)


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
    await consume_rate(db, identity, "conversations", 60)
    return await get_conversation_messages(db, identity.user_id, conv_id)


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