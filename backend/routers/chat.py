import logging
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Request
from google.genai import errors
from dependencies import get_bot_service, get_conversation_manager, get_request_identity, get_storage_service
from schemas.chat import ChatRequest, StopRequest
from services.chat_service import generate_chat_response
from services.guest_usage_service import consume_rate

router = APIRouter(tags=['chat'])
logger = logging.getLogger(__name__)


@router.get('/generations/{request_id}')
async def generation_status(request_id: UUID, db=Depends(get_conversation_manager), identity=Depends(get_request_identity)):
    job = await db.get_job(str(request_id), identity.user_id)
    if job is None:
        raise HTTPException(404, 'Request not found')
    return {'status': job['status'], 'conversation_id': job['conversation_id'], 'result': job['result']}


@router.post('/generate')
async def generate_api(req: ChatRequest, request: Request, db=Depends(get_conversation_manager),
                       bot=Depends(get_bot_service), storage=Depends(get_storage_service),
                       identity=Depends(get_request_identity)):
    try:
        return await generate_chat_response(db, bot, storage, identity, req, request)
    except HTTPException:
        raise
    except errors.APIError as error:
        status = 429 if error.code == 429 else 502
        message = {
            400: 'The AI provider rejected the generation settings or request. Try another model or prompt.',
            401: 'The AI provider credentials are invalid. Please contact the administrator.',
            403: 'The AI provider denied access. Check API permissions and billing.',
            404: 'This model is not available for the configured API account. Please choose another model.',
            429: 'The AI provider quota or rate limit was reached. Check billing or try again later.',
        }.get(error.code, 'AI provider is unavailable or rejected the request. Please retry or choose another model.')
        raise HTTPException(status, message) from None
    except Exception:
        logger.error('Unexpected generation failure', exc_info=False)
        raise HTTPException(500, 'Unable to generate a response. Please retry.') from None


@router.post('/stop')
async def stop_generation(req: StopRequest, db=Depends(get_conversation_manager), identity=Depends(get_request_identity)):
    await consume_rate(db, identity, 'stop', 30)
    await db.cancel_generation(str(req.request_id), identity.user_id)
    return {'status': 'stopped'}
