from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
from fastapi import HTTPException
from routers.conversations import read_history
from services.guest_usage_service import RequestIdentity

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
