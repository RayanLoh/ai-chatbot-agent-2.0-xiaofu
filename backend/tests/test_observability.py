import logging
from uuid import UUID
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
import pytest
from services.observability import RequestContextMiddleware, log_failure, request_id
from services.supabase_db import ConversationManager
from types import SimpleNamespace
from unittest.mock import Mock


async def test_database_logs_only_safe_metadata(caplog):
    class DatabaseError(Exception):
        code = '42501'
    db = ConversationManager.__new__(ConversationManager)
    db.supabase = SimpleNamespace(table=Mock(side_effect=DatabaseError(
        'SECRET_API_KEY private prompt and SQL contents')))
    with pytest.raises(HTTPException) as error:
        await db.get_conversation('owned', 'user:test')
    assert error.value.status_code == 503
    assert '42501' in caplog.text
    assert 'ConversationManager.get_conversation' in caplog.text
    assert 'SECRET_API_KEY' not in caplog.text
    assert 'private prompt' not in caplog.text


def test_response_and_failure_log_share_server_generated_request_id(caplog):
    app = FastAPI()
    app.add_middleware(RequestContextMiddleware)
    @app.get('/')
    async def failure():
        log_failure(logging.getLogger('test.failure'), 'database.read', RuntimeError('secret payload'))
        return {'ok': False}
    with TestClient(app) as client:
        first = client.get('/', headers={'X-Request-ID': 'untrusted secret'})
        second = client.get('/')
    ident = first.headers['x-request-id']
    UUID(ident)
    assert ident in caplog.text
    assert ident != second.headers['x-request-id']
    assert request_id.get() == 'background'
    assert 'secret' not in caplog.text
