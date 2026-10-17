import io
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
import pytest
from fastapi import HTTPException
from PIL import Image
from config import Config
from core.agent import XiaofuAgent, maximum_cost
from services.asset_service import OwnedStorage, asset_id
from services.chat_service import generate_chat_response
from test_chat import fixtures
from cleanup_assets import cleanup
import httpx
import json
from google import genai
from google.genai import types


async def test_installed_sdk_serializes_count_and_generate_without_live_network(monkeypatch):
    calls = []
    def respond(request):
        payload = json.loads(request.content)
        calls.append((request.url.path, payload))
        if request.url.path.endswith(':countTokens'):
            return httpx.Response(200, json={'totalTokens': 100})
        return httpx.Response(200, json={
            'candidates': [{'content': {'role': 'model', 'parts': [{'text': 'Offline SDK reply'}]}}],
            'usageMetadata': {'promptTokenCount': 100, 'candidatesTokenCount': 5, 'totalTokenCount': 105},
        })
    real_client = genai.Client
    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as http:
        monkeypatch.setattr('core.agent.genai.Client', lambda **kwargs: real_client(
            api_key='offline-test', http_options=types.HttpOptions(httpx_async_client=http)))
        monkeypatch.setattr(Config, 'MODEL_BUDGETS', {'m': {'input': 1, 'output': 4}})
        reserve = AsyncMock()
        result = await XiaofuAgent('offline-test', 'System prompt').get_response([{'text': 'Question'}], 'm', None, reserve)
    assert result['text'] == 'Offline SDK reply'
    assert result['usage']['total_token_count'] == 105
    assert len(calls) == 2
    assert calls[0][0].endswith(':countTokens')
    assert calls[0][1]['contents'][0]['parts'][0]['text'] == 'System prompt'
    assert calls[1][1]['generationConfig']['maxOutputTokens'] == Config.MAX_OUTPUT_TOKENS
    assert calls[1][1]['generationConfig']['candidateCount'] == 1
    reserve.assert_awaited_once()


async def test_successful_request_replays_without_model_or_new_turns():
    db, bot, req, identity, http = fixtures()
    cached = {'text': 'paid reply', 'images': [], 'conversation_id': 'existing'}
    db.start_job.return_value = {'status': 'succeeded', 'result': cached}
    assert await generate_chat_response(db, bot, None, identity, req, http) == cached
    bot.get_response.assert_not_called()
    db.complete_job.assert_not_called()


async def test_failed_request_requires_explicit_new_attempt():
    db, bot, req, identity, http = fixtures()
    db.start_job.return_value = {'status': 'failed'}
    with pytest.raises(HTTPException) as error:
        await generate_chat_response(db, bot, None, identity, req, http)
    assert error.value.status_code == 409
    bot.get_response.assert_not_called()


async def test_cleanup_failure_cannot_mask_committed_success():
    db, bot, req, identity, http = fixtures()
    db.finish_generation.side_effect = HTTPException(503, 'offline')
    result = await generate_chat_response(db, bot, None, identity, req, http)
    assert result['text'] == 'Hi Rayan'


async def test_model_failure_does_not_commit_half_a_turn():
    db, bot, req, identity, http = fixtures()
    bot.get_response.side_effect = HTTPException(502, 'provider offline')
    with pytest.raises(HTTPException):
        await generate_chat_response(db, bot, None, identity, req, http)
    db.complete_job.assert_not_called()
    db.add_message.assert_not_called()


@pytest.mark.parametrize('rates', [{}, {'m': {'input': -1, 'output': 4}},
    {'m': {'input': 'NaN', 'output': 4}}, {'m': {'input': 0, 'output': 0}}])
def test_budget_missing_or_invalid_fails_closed(monkeypatch, rates):
    monkeypatch.setattr(Config, 'MODEL_BUDGETS', rates)
    with pytest.raises(HTTPException) as error:
        maximum_cost('m', 100)
    assert error.value.status_code == 503


async def test_budget_rejection_prevents_generate_content(monkeypatch):
    generated = AsyncMock()
    class Client:
        def __init__(self, **kwargs): self.aio = self; self.models = self
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        count_tokens = AsyncMock(return_value=SimpleNamespace(total_tokens=100))
        generate_content = generated
    monkeypatch.setattr('core.agent.genai.Client', Client)
    monkeypatch.setattr(Config, 'MODEL_BUDGETS', {'m': {'input': 1, 'output': 4}})
    reserve = AsyncMock(side_effect=HTTPException(429, 'budget exceeded'))
    with pytest.raises(HTTPException) as error:
        await XiaofuAgent('fake-key', 'system').get_response([{'text': 'hi'}], 'm', None, reserve)
    assert error.value.status_code == 429
    generated.assert_not_called()


@pytest.mark.parametrize('ref', ['https://images.example.com/images/x.png', '/assets/../secrets', '/assets/not-a-uuid'])
def test_private_images_reject_arbitrary_or_legacy_public_references(ref):
    with pytest.raises(HTTPException): asset_id(ref)


async def test_image_owner_is_checked_before_storage_read():
    db = SimpleNamespace(get_asset=AsyncMock(side_effect=HTTPException(404, 'Image not found')))
    storage = SimpleNamespace(read_image=Mock())
    with pytest.raises(HTTPException):
        await OwnedStorage(storage, db, 'user:b').fetch_image('/assets/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    db.get_asset.assert_awaited_once_with('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'user:b')
    storage.read_image.assert_not_called()


async def test_image_cannot_be_rebound_to_another_conversation():
    db = SimpleNamespace(get_asset=AsyncMock(return_value={'conversation_id': 'one'}))
    with pytest.raises(HTTPException) as error:
        await OwnedStorage(None, db, 'user:a', 'two').check_image('/assets/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    assert error.value.status_code == 409


async def test_upload_records_object_before_io_and_returns_no_public_url(monkeypatch):
    monkeypatch.setattr(Config, 'R2_PRIVATE_BUCKET_CONFIRMED', True)
    events = []
    async def create(*args): events.append('record')
    def write(*args): events.append('upload')
    db = SimpleNamespace(create_asset=AsyncMock(side_effect=create), ready_asset=AsyncMock(return_value=True))
    storage = SimpleNamespace(s3_client=object(), write_image=write)
    buf = io.BytesIO(); Image.new('RGB', (1, 1)).save(buf, format='PNG')
    reference = await OwnedStorage(storage, db, 'owner').upload_image(buf.getvalue())
    assert reference.startswith('/assets/')
    assert events == ['record', 'upload']


async def test_failed_cleanup_keeps_persistent_queue_entry():
    db = SimpleNamespace(_execute=AsyncMock(side_effect=[[], [{'id': 'a', 'object_key': 'private/a'}]]))
    storage = SimpleNamespace(bucket='test', s3_client=SimpleNamespace(delete_object=Mock(side_effect=RuntimeError('offline'))))
    await cleanup(db, storage)
    assert db._execute.await_count == 2  # No DB delete after R2 deletion fails.


async def test_uploads_use_stable_distinct_user_and_guest_directories(monkeypatch):
    monkeypatch.setattr(Config, 'R2_PRIVATE_BUCKET_CONFIRMED', True)
    monkeypatch.setattr('services.asset_service.uuid.uuid4', lambda: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    db = SimpleNamespace(create_asset=AsyncMock(), ready_asset=AsyncMock(return_value=True))
    storage = SimpleNamespace(s3_client=object(), write_image=Mock())
    buf = io.BytesIO(); Image.new('RGB', (1, 1)).save(buf, format='PNG')
    keys = []
    for owner in ('user:a', 'user:b', 'guest:a', 'user:a'):
        await OwnedStorage(storage, db, owner).upload_image(buf.getvalue())
        key = db.create_asset.call_args.args[2]
        assert storage.write_image.call_args.args[0] == key
        keys.append(key)
    assert keys[0].startswith('private/users/')
    assert keys[2].startswith('private/guests/')
    assert len(set(keys[:3])) == 3
    assert keys[0] == keys[3]
    assert all('user:' not in key and 'guest:' not in key for key in keys)
