from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
from fastapi.testclient import TestClient
from starlette.requests import Request
from fastapi import HTTPException
from main import app
from dependencies import get_conversation_manager, get_request_identity
from services.guest_usage_service import RequestIdentity, issue_guest_token, verify_guest_token
import dependencies
from services.supabase_db import ConversationManager


@pytest.mark.asyncio
@pytest.mark.parametrize('verified', [False, True])
async def test_test_access_binding_only_uses_google_verified_email(monkeypatch, verified):
    db = SimpleNamespace(consume_usage=AsyncMock(return_value=True), bind_tester_account=AsyncMock())
    monkeypatch.setattr(dependencies, 'verify_google_id_token', lambda _: SimpleNamespace(
        sub='google-sub', email='owner@example.com', email_verified=verified))
    request = Request({'type':'http','headers':[(b'authorization',b'Bearer test')], 'client':('127.0.0.1',1)})
    identity = await get_request_identity(request, db)
    assert identity.user_id == 'user:google-sub'
    if verified:
        db.bind_tester_account.assert_awaited_once_with('user:google-sub', 'owner@example.com')
    else:
        db.bind_tester_account.assert_not_awaited()


@pytest.mark.asyncio
async def test_claimed_guest_token_is_rejected():
    db = SimpleNamespace(consume_usage=AsyncMock(return_value=True), guest_history_claimed=AsyncMock(return_value=True))
    request = Request({'type':'http','headers':[(b'x-guest-token',issue_guest_token().encode())], 'client':('127.0.0.1',1)})
    with pytest.raises(HTTPException) as error:
        await get_request_identity(request, db)
    assert error.value.status_code == 401
    assert error.value.detail['code'] == 'INVALID_GUEST_TOKEN'


@pytest.mark.parametrize('status,expected', [('claimed',200),('subscription_required',403),('busy',409),('conflict',409)])
def test_claim_uses_verified_guest_and_logged_in_owner(status,expected):
    db = SimpleNamespace(claim_guest_history=AsyncMock(return_value={'status':status,'moved':1}))
    app.dependency_overrides[get_conversation_manager] = lambda: db
    app.dependency_overrides[get_request_identity] = lambda: RequestIdentity('user:real-owner',False,'network')
    token = issue_guest_token()
    try:
        response = TestClient(app).post('/conversations/claim-guest',json={
            'guest_token':token, 'user_id':'user:attacker', 'plan':'pro'})
        assert response.status_code == expected
        db.claim_guest_history.assert_awaited_once_with(verify_guest_token(token),'user:real-owner')
    finally:
        app.dependency_overrides.clear()


def test_forged_guest_cannot_claim_history():
    db = SimpleNamespace(claim_guest_history=AsyncMock())
    app.dependency_overrides[get_conversation_manager] = lambda: db
    app.dependency_overrides[get_request_identity] = lambda: RequestIdentity('user:owner',False,'network')
    try:
        response = TestClient(app).post('/conversations/claim-guest',json={'guest_token':'forged'})
        assert response.status_code == 401
        db.claim_guest_history.assert_not_awaited()
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_rollout_only_tolerates_explicit_missing_schema_codes():
    class DatabaseError(Exception):
        code = 'PGRST205'
    db = ConversationManager.__new__(ConversationManager)
    db.supabase = object()
    def fail(_):
        raise DatabaseError('private error details')
    assert await db._execute(fail, missing_codes=('PGRST205',), missing_value=[]) == []
    DatabaseError.code = '42501'
    with pytest.raises(HTTPException) as error:
        await db._execute(fail, missing_codes=('PGRST205',), missing_value=[])
    assert error.value.status_code == 503
    assert 'private' not in error.value.detail
