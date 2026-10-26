from unittest.mock import AsyncMock
from types import SimpleNamespace
import pytest
from services.chat_service import _watch_cancel
from services.guest_usage_service import RequestIdentity


async def test_cancel_polling_backs_off_but_checks_cancellation_across_instances(monkeypatch):
    sleep = AsyncMock()
    monkeypatch.setattr('services.chat_service.asyncio.sleep', sleep)
    db = SimpleNamespace(generation_active=AsyncMock(side_effect=[True, True, True, True, False]))
    await _watch_cancel(db, RequestIdentity('user:test', False, 'network'), 'request')
    assert [call.args[0] for call in sleep.await_args_list] == [0.5, 1.0, 2.0, 2.0]
    assert db.generation_active.await_count == 5


async def test_cancel_polling_does_not_treat_database_failure_as_active():
    db = SimpleNamespace(generation_active=AsyncMock(side_effect=RuntimeError('offline')))
    with pytest.raises(RuntimeError):
        await _watch_cancel(db, RequestIdentity('user:test', False, 'network'), 'request')
