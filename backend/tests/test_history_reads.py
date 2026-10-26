from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
from fastapi import HTTPException
from routers.conversations import read_history
from services.guest_usage_service import RequestIdentity
from services.supabase_db import ConversationManager
from services.pagination import message_page
from fastapi.testclient import TestClient
from main import app
from dependencies import get_conversation_manager, get_request_identity

identity = RequestIdentity('user:reader', False, 'network')


async def test_batched_read_uses_one_call_without_repeating_route_limits():
    db = SimpleNamespace(read_owned_history=AsyncMock(return_value={'code': 'OK', 'messages': [{'text': 'Hi'}]}),
                         consume_usage=AsyncMock())
    assert await read_history(db, identity, 'chat') == {'messages': [{'text': 'Hi'}]}
    db.read_owned_history.assert_awaited_once_with(identity, 'chat')
    db.consume_usage.assert_not_awaited()


@pytest.mark.parametrize('code,status', [('RATE_LIMITED', 429), ('NOT_FOUND', 404), ('UNEXPECTED', 503)])
async def test_batched_read_preserves_denials(code, status):
    db = SimpleNamespace(read_owned_history=AsyncMock(return_value={'code': code}))
    with pytest.raises(HTTPException) as error:
        await read_history(db, identity, 'chat')
    assert error.value.status_code == status


async def test_missing_migration_retains_both_limits_and_owned_read():
    db = SimpleNamespace(read_owned_history=AsyncMock(return_value=None),
        consume_usage=AsyncMock(return_value=True), get_messages=AsyncMock(return_value=[{'text': 'old path'}]))
    assert await read_history(db, identity, 'chat') == {'messages': [{'text': 'old path'}]}
    assert db.consume_usage.await_count == 2
    db.get_messages.assert_awaited_once_with('chat', 'user:reader')


async def test_fallback_denial_never_reads_data():
    db = SimpleNamespace(read_owned_history=AsyncMock(return_value=None),
        consume_usage=AsyncMock(return_value=False), get_messages=AsyncMock())
    with pytest.raises(HTTPException) as error:
        await read_history(db, identity, 'chat')
    assert error.value.status_code == 429
    db.get_messages.assert_not_awaited()


async def test_missing_migrations_still_return_a_page_without_losing_older_messages():
    db = SimpleNamespace(read_owned_history=AsyncMock(return_value=None),
        consume_usage=AsyncMock(return_value=True), get_messages=AsyncMock(return_value=list(range(120))))
    page = await read_history(db, identity, 'chat', 50, 70)
    assert page['messages'] == list(range(20, 70))
    assert page['next_before'] == 20
    assert page['has_more'] is True


async def test_context_query_is_bounded_and_owned():
    db = ConversationManager.__new__(ConversationManager)
    db._execute = AsyncMock(return_value={'messages': ['recent']})
    assert await db.get_conversation('chat', 'user:reader', context_limit=40) == {'messages': ['recent']}
    client = SimpleNamespace(rpc=lambda name, params: (name, params))
    name, params = db._execute.call_args.args[0](client)
    assert name == 'read_conversation_context'
    assert params == {'p_conv': 'chat', 'p_owner': 'user:reader', 'p_limit': 40}


def test_page_boundaries_are_stable_when_messages_are_appended():
    messages = list(range(120))
    page = message_page(messages, 50)
    assert page['messages'] == list(range(70, 120))
    messages.append(120)
    assert message_page(messages, 50, page['next_before'])['messages'] == list(range(20, 70))


@pytest.mark.parametrize('query', ['limit=0', 'limit=101', 'limit=50&before=-1', 'before=20'])
def test_invalid_page_parameters_are_rejected(query):
    db = SimpleNamespace(read_owned_history=AsyncMock())
    app.dependency_overrides[get_conversation_manager] = lambda: db
    app.dependency_overrides[get_request_identity] = lambda: identity
    try:
        assert TestClient(app).get('/conversations/chat?' + query).status_code == 422
        db.read_owned_history.assert_not_awaited()
    finally:
        app.dependency_overrides.clear()
