"""Correlate failures without recording credentials, prompts or query contents."""
from contextvars import ContextVar
import re
from uuid import uuid4

request_id = ContextVar('request_id', default='background')


def log_failure(logger, operation, error):
    code = str(getattr(error, 'code', 'unknown'))
    if not re.fullmatch(r'[A-Za-z0-9_]{1,32}', code):
        code = 'unknown'
    logger.error('%s failed; type=%s code=%s request_id=%s',
                 operation, type(error).__name__, code, request_id.get())


class RequestContextMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.app(scope, receive, send)
        ident = str(uuid4())
        token = request_id.set(ident)

        async def traced_send(message):
            if message['type'] == 'http.response.start':
                message['headers'] = [*message.get('headers', []), (b'x-request-id', ident.encode())]
            await send(message)

        try:
            await self.app(scope, receive, traced_send)
        finally:
            request_id.reset(token)
