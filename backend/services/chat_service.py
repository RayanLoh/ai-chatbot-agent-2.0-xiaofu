import asyncio
import contextlib
import hashlib
import json
import logging
from fastapi import HTTPException
from config import Config
from services.guest_usage_service import consume_rate
from services.asset_service import OwnedStorage

logger = logging.getLogger(__name__)


async def _watch_cancel(db, identity, request_id):
    while True:
        if not await db.generation_active(request_id, identity.user_id):
            return
        await asyncio.sleep(0.5)


async def generate_chat_response(db, bot, storage, identity, request, http_request):
    await consume_rate(db, identity, 'generate', 10)
    request_id = str(request.request_id)
    payload_hash = hashlib.sha256(json.dumps({
        'prompt': request.prompt, 'model': request.model_name,
        'images': request.image_urls, 'conversation': request.conversation_id,
    }, sort_keys=True).encode()).hexdigest()
    job = await db.start_job(request_id, identity.user_id, request.conversation_id, payload_hash)
    status = job['status']
    if status == 'succeeded':
        return job['result']
    if status != 'started':
        raise HTTPException(404 if status == 'missing' else 409, {
            'code': 'GENERATION_' + status.upper(),
            'detail': 'Request is already running.' if status == 'running' else 'Request cannot be reused. Restore your draft and send again.'})
    conv_id = job['conversation_id']
    work = watcher = None
    try:
        owned_storage = OwnedStorage(storage, db, identity.user_id, conv_id)
        for url in request.image_urls:
            await owned_storage.check_image(url)
        conversation = await db.get_conversation(conv_id, identity.user_id) if request.conversation_id else {'messages': []}
        if conversation is None:
            raise HTTPException(404, 'Conversation not found')
        history = [*(conversation.get('messages') or []), {'sender': 'user', 'text': request.prompt, 'images': request.image_urls}]

        async def reserve(cost):
            await db.reserve_budget(request_id, identity.user_id, cost, request.model_name,
                identity.network_id if identity.is_guest else None)

        work = asyncio.create_task(bot.get_response(history, request.model_name, owned_storage, reserve))
        watcher = asyncio.create_task(_watch_cancel(db, identity, request_id))
        # A browser disconnect does not discard a paid reply. /stop is explicit.
        done, _ = await asyncio.wait({work, watcher}, timeout=Config.GENERATION_TIMEOUT, return_when=asyncio.FIRST_COMPLETED)
        if not done:
            raise HTTPException(504, 'AI request timed out. Restore your draft and try again.')
        if watcher in done:
            watcher.result()
            raise HTTPException(409, {'detail': 'Generation cancelled', 'code': 'GENERATION_CANCELLED'})
        response = work.result()
        # Both turns and the replayable result commit in one transaction.
        return await db.complete_job(request_id, identity.user_id, request.prompt, request.image_urls, response, conv_id)
    finally:
        for task in (work, watcher):
            if task is not None:
                task.cancel()
        for task in (work, watcher):
            if task is not None:
                with contextlib.suppress(asyncio.CancelledError, Exception):
                    await task
        try:
            await db.finish_generation(request_id, identity.user_id)
        except Exception:
            logger.warning('Generation finalization deferred to lease expiry')
