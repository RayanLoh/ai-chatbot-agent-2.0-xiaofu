from datetime import datetime, timezone

from fastapi import HTTPException


async def list_conversations(db, user_id: str):
    data = await db.get_user_conversations(user_id=user_id)
    return {"conversations": data}


async def create_conversation(db, user_id: str, title: str):
    normalized_title = title.strip() or "New Conversation"
    conv_id = await db.create_conversation(user_id=user_id, title=normalized_title)
    return {
        "id": conv_id,
        "title": normalized_title,
        "message_count": 0,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


async def get_conversation_messages(db, user_id: str, conv_id: str):
    messages = await db.get_messages(conv_id, user_id)
    if messages is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    return {"messages": messages}


async def update_conversation_title(db, user_id: str, conv_id: str, title: str):
    normalized_title = title.strip()
    if not normalized_title:
        raise HTTPException(status_code=400, detail="Title cannot be empty")

    updated = await db.update_title(conv_id, user_id, normalized_title)
    if not updated:
        raise HTTPException(status_code=404, detail="Conversation not found")

    return {"status": "updated", "id": conv_id, "title": normalized_title}


async def delete_conversation(db, user_id: str, conv_id: str):
    deleted = await db.delete_conversation(conv_id, user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Conversation not found")

    return {"status": "deleted"}