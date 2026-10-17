import asyncio
from types import SimpleNamespace
from uuid import uuid4
from unittest.mock import AsyncMock
import pytest
from fastapi import HTTPException
from services.chat_service import generate_chat_response
from services.guest_usage_service import RequestIdentity
from services.supabase_db import ConversationManager
from schemas.chat import ChatRequest
from core.agent import XiaofuAgent
from google.genai import types


def fixtures():
    db = SimpleNamespace(
        get_conversation=AsyncMock(return_value={'messages': [{'sender': 'user', 'text': 'My name is Rayan'}]}),
        start_job=AsyncMock(return_value={'status': 'started', 'conversation_id': 'existing'}), consume_usage=AsyncMock(return_value=True),
        complete_job=AsyncMock(return_value={'text': 'Hi Rayan', 'images': [], 'conversation_id': 'existing'}),
        generation_active=AsyncMock(return_value=True), add_message=AsyncMock(return_value=True),
        finish_generation=AsyncMock(return_value=True))
    bot = SimpleNamespace(get_response=AsyncMock(return_value={'text': 'Hi Rayan', 'images': []}))
    request = ChatRequest(prompt='What is my name?', conversation_id='existing', request_id=uuid4())
    identity = RequestIdentity('user:test', False, 'network')
    async def receive():
        await asyncio.sleep(60)
        return {'type': 'http.disconnect'}
    http = SimpleNamespace(receive=AsyncMock(side_effect=receive))
    return db, bot, request, identity, http


async def test_restores_database_history_and_persists_reply():
    db, bot, req, identity, http = fixtures()
    result = await generate_chat_response(db, bot, None, identity, req, http)
    history = bot.get_response.call_args.args[0]
    assert history[0]['text'] == 'My name is Rayan'
    assert history[-1]['text'] == req.prompt
    assert result['conversation_id'] == 'existing'
    db.complete_job.assert_awaited_once()
    db.finish_generation.assert_awaited_once()


async def test_missing_or_other_users_conversation_stays_404():
    db, bot, req, identity, http = fixtures()
    db.get_conversation.return_value = None
    with pytest.raises(HTTPException) as error:
        await generate_chat_response(db, bot, None, identity, req, http)
    assert error.value.status_code == 404
    bot.get_response.assert_not_called()


async def test_storage_failure_prevents_model_call():
    db, bot, req, identity, http = fixtures()
    db.get_conversation.side_effect = HTTPException(503, 'Database unavailable')
    with pytest.raises(HTTPException) as error:
        await generate_chat_response(db, bot, None, identity, req, http)
    assert error.value.status_code == 503
    bot.get_response.assert_not_called()
    db.finish_generation.assert_awaited_once()


async def test_cancel_aborts_model_task_and_does_not_save_bot():
    db, bot, req, identity, http = fixtures()
    stopped = asyncio.Event()
    async def pending(*args):
        try:
            await asyncio.sleep(60)
        finally:
            stopped.set()
    bot.get_response.side_effect = pending
    db.generation_active.return_value = False
    with pytest.raises(HTTPException) as error:
        await generate_chat_response(db, bot, None, identity, req, http)
    assert error.value.status_code == 409
    assert stopped.is_set()
    db.complete_job.assert_not_awaited()


async def test_disconnect_keeps_durable_generation():
    db, bot, req, identity, http = fixtures()
    http.receive.side_effect = None
    http.receive.return_value = {'type': 'http.disconnect'}
    result = await generate_chat_response(db, bot, None, identity, req, http)
    assert result['text'] == 'Hi Rayan'
    db.complete_job.assert_awaited_once()


async def test_duplicate_or_busy_generation_does_not_call_provider():
    db, bot, req, identity, http = fixtures()
    db.start_job.return_value = {'status': 'busy'}
    with pytest.raises(HTTPException) as error:
        await generate_chat_response(db, bot, None, identity, req, http)
    assert error.value.status_code == 409
    bot.get_response.assert_not_called()


async def test_database_errors_are_not_empty_success():
    db = ConversationManager()
    db.supabase = SimpleNamespace()
    with pytest.raises(HTTPException) as error:
        await db._execute(lambda client: (_ for _ in ()).throw(RuntimeError('secret internal details')))
    assert error.value.status_code == 503
    assert 'secret' not in error.value.detail


async def test_new_sdk_receives_multimodal_database_history(monkeypatch):
    calls = []
    class Client:
        def __init__(self, **kwargs): self.aio = self; self.models = self
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def count_tokens(self, **kwargs): return types.CountTokensResponse(total_tokens=100)
        async def generate_content(self, **kwargs):
            calls.append(kwargs)
            return types.GenerateContentResponse(candidates=[types.Candidate(content=types.Content(
                role='model', parts=[types.Part.from_text(text='I remember the image')]))])
    monkeypatch.setattr('core.agent.genai.Client', Client)
    from config import Config
    monkeypatch.setattr(Config, 'MODEL_BUDGETS', {'gemini-2.5-flash': {'input': 1, 'output': 4}})
    storage = SimpleNamespace(fetch_image=AsyncMock(return_value=(b'png-bytes', 'image/png')))
    reserve = AsyncMock()
    history = [{'sender': 'user', 'text': 'Look at this', 'images': ['image-url']},
               {'sender': 'bot', 'text': 'A cat'}, {'sender': 'user', 'text': 'What animal was it?'}]
    result = await XiaofuAgent('test', 'system').get_response(history, 'gemini-2.5-flash', storage, reserve)
    assert result['text'] == 'I remember the image'
    assert calls[0]['contents'][0].parts[1].inline_data.data == b'png-bytes'
    assert calls[0]['contents'][1].role == 'model'
    reserve.assert_awaited_once_with(8420)
    assert calls[0]['config'].max_output_tokens == 2048


async def test_timeout_cancels_wait_and_never_persists_bot(monkeypatch):
    from config import Config
    monkeypatch.setattr(Config, 'GENERATION_TIMEOUT', 0.01)
    db, bot, req, identity, http = fixtures()
    async def pending(*args): await asyncio.sleep(60)
    bot.get_response.side_effect = pending
    with pytest.raises(HTTPException) as error:
        await generate_chat_response(db, bot, None, identity, req, http)
    assert error.value.status_code == 504
    db.complete_job.assert_not_awaited()
    db.finish_generation.assert_awaited_once()


async def test_history_is_refreshed_after_acquiring_generation_lease():
    db, bot, req, identity, http = fixtures()
    db.get_conversation.return_value = {'messages': [{'sender': 'bot', 'text': 'Just finished reply'}]}
    await generate_chat_response(db, bot, None, identity, req, http)
    assert bot.get_response.call_args.args[0][0]['text'] == 'Just finished reply'

