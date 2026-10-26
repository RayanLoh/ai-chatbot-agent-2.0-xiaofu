import io
import time
from uuid import uuid4
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from PIL import Image
from pydantic import ValidationError
from config import Config
from main import app
from dependencies import get_conversation_manager
from services.auth_service import extract_bearer_token
from services.guest_usage_service import issue_guest_token, verify_guest_token, RequestIdentity
from services.image_security import validate_image
from services.asset_service import asset_id, OwnedStorage
from schemas.chat import ChatRequest

URL = 'https://images.example.com/images/12345678-1234-1234-1234-123456789abc.png'


def test_signed_guest_identity_cannot_be_forged_or_shared():
    first, second = issue_guest_token(), issue_guest_token()
    assert verify_guest_token(first) != verify_guest_token(second)
    with pytest.raises(HTTPException) as error:
        verify_guest_token(first[:-1] + ('a' if first[-1] != 'a' else 'b'))
    assert error.value.status_code == 401


def test_expired_guest_rejected(monkeypatch):
    token = issue_guest_token()
    monkeypatch.setattr(time, 'time', lambda: 9999999999)
    with pytest.raises(HTTPException):
        verify_guest_token(token)


@pytest.mark.parametrize('value', [URL, 'http://127.0.0.1/admin', 'https://images.example.com.evil.com/images/x.png',
    'https://images.example.com@127.0.0.1/a', 'https://images.example.com/images/../secret',
    URL + '?redirect=http://localhost', URL + '#x', URL.replace('https:', 'http:'),
    URL.replace('/images/', '/images/%2e%2e/'), URL.replace('.com/', '.com:8443/')])
def test_untrusted_image_urls_rejected(value):
    with pytest.raises(HTTPException):
        asset_id(value)


def test_storage_url_and_image_validation():
    assert asset_id('/assets/12345678-1234-1234-1234-123456789abc') == '12345678-1234-1234-1234-123456789abc'
    data = io.BytesIO()
    Image.new('RGB', (2, 2)).save(data, format='PNG')
    assert validate_image(data.getvalue(), 'image/png') == 'image/png'
    for payload, mime in [(b'<svg></svg>', 'image/svg+xml'), (data.getvalue(), 'image/jpeg')]:
        with pytest.raises(HTTPException):
            validate_image(payload, mime)


async def test_public_image_reference_never_reaches_database_or_storage():
    db = SimpleNamespace(get_asset=AsyncMock())
    storage = SimpleNamespace(read_image=Mock())
    with pytest.raises(HTTPException) as error:
        await OwnedStorage(storage, db, 'user:owner').fetch_image(URL)
    assert error.value.status_code == 400
    db.get_asset.assert_not_awaited()
    storage.read_image.assert_not_called()


@pytest.mark.parametrize('overrides', [{'prompt': {}}, {'prompt': ' '}, {'prompt': 'x'*20001},
    {'model_name': None}, {'model_name': 'arbitrary-paid-model'}, {'image_urls': ['x']*5}])
def test_request_validation(overrides):
    with pytest.raises(ValidationError):
        ChatRequest(**{'prompt': 'Hello', 'request_id': uuid4(), **overrides})


def test_empty_bearer_is_not_downgraded_to_guest():
    with pytest.raises(HTTPException):
        extract_bearer_token('Bearer ')


def test_missing_identity_and_health():
    with TestClient(app) as client:
        assert client.get('/health').json() == {'status': 'ok'}
        assert client.get('/conversations').status_code == 401


def test_no_blanket_vercel_cors():
    with TestClient(app) as client:
        response = client.options('/generate', headers={'Origin': 'https://unknown.vercel.app',
            'Access-Control-Request-Method': 'POST'})
        assert 'access-control-allow-origin' not in response.headers


async def test_quota_is_independent_of_conversation_history():
    from services.supabase_db import ConversationManager
    db = ConversationManager()
    db._execute = AsyncMock(return_value={'code':'GUEST_LIMIT_REACHED'})
    with pytest.raises(HTTPException) as error:
        await db.reserve_budget(str(uuid4()), 'guest:test', 1, Config.DEFAULT_MODEL, 'network')
    assert error.value.status_code == 403


def test_guest_session_is_signed_and_requires_database():
    db = SimpleNamespace(consume_usage=AsyncMock(return_value=True))
    app.dependency_overrides[get_conversation_manager] = lambda: db
    try:
        with TestClient(app) as client:
            token = client.post('/guest-session').json()['token']
            assert verify_guest_token(token).startswith('guest:')
    finally:
        app.dependency_overrides.clear()


def test_upload_rejects_large_request_before_reading():
    with TestClient(app) as client:
        response = client.post('/upload', headers={'Content-Length': str(12*1024*1024)}, content=b'')
        assert response.status_code == 413


def test_chunked_oversized_request_is_rejected():
    with TestClient(app) as client:
        response = client.post('/generate', headers={'Content-Type': 'application/json'},
            content=iter([b'{"prompt":"', b'x' * (300 * 1024), b'"}']))
        assert response.status_code == 413


def test_legacy_guest_id_is_not_an_identity():
    with TestClient(app) as client:
        assert client.get('/conversations', headers={'X-Guest-Id': 'other-user'}).status_code == 401


def test_guest_rate_limit_applies_before_conversation_access():
    db = SimpleNamespace(consume_usage=AsyncMock(return_value=False), get_user_conversations=AsyncMock())
    app.dependency_overrides[get_conversation_manager] = lambda: db
    try:
        with TestClient(app) as client:
            response = client.get('/conversations', headers={'X-Guest-Token': issue_guest_token()})
            assert response.status_code == 429
            db.get_user_conversations.assert_not_called()
    finally:
        app.dependency_overrides.clear()


def test_invalid_auth_error_survives_api_error_handling(monkeypatch):
    def invalid(token):
        raise HTTPException(401, {'detail': 'Sign in again', 'code': 'INVALID_AUTH_TOKEN'})
    monkeypatch.setattr('dependencies.verify_google_id_token', invalid)
    app.dependency_overrides[get_conversation_manager] = lambda: SimpleNamespace(consume_usage=AsyncMock(return_value=True))
    try:
        with TestClient(app) as client:
            response = client.post('/generate', headers={'Authorization': 'Bearer invalid'}, json={
                'request_id': str(uuid4()), 'prompt': 'Hi',
            })
            assert response.status_code == 401
            assert response.json()['detail']['code'] == 'INVALID_AUTH_TOKEN'
    finally:
        app.dependency_overrides.clear()


def test_generate_route_keeps_404_and_returns_persisted_reply():
    from dependencies import get_bot_service
    db = SimpleNamespace(
        consume_usage=AsyncMock(return_value=True),
        guest_history_claimed=AsyncMock(return_value=False),
        get_conversation=AsyncMock(return_value=None),
        start_job=AsyncMock(return_value={'status': 'started', 'conversation_id': 'test-conversation'}),
        complete_job=AsyncMock(return_value={'text':'Hello','images':[],'conversation_id':'test-conversation'}),
        generation_active=AsyncMock(return_value=True),
        finish_generation=AsyncMock(return_value=True),
    )
    bot = SimpleNamespace(get_response=AsyncMock(return_value={'text': 'Hello', 'images': []}))
    app.dependency_overrides[get_conversation_manager] = lambda: db
    app.dependency_overrides[get_bot_service] = lambda: bot
    try:
        with TestClient(app) as client:
            headers = {'X-Guest-Token': issue_guest_token()}
            payload = {'prompt': 'Hi', 'request_id': str(uuid4()), 'conversation_id': 'test-conversation'}
            assert client.post('/generate', headers=headers, json=payload).status_code == 404
            db.get_conversation.return_value = {'messages': []}
            response = client.post('/generate', headers=headers, json=payload)
            assert response.status_code == 200
            assert response.json()['text'] == 'Hello'
            db.complete_job.assert_awaited_once()
    finally:
        app.dependency_overrides.clear()
