import asyncio
from starlette.responses import JSONResponse


class BodyLimitMiddleware:
    """Bound bytes before framework JSON/multipart parsing, including chunked bodies."""
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            await self.app(scope, receive, send)
            return
        headers = dict(scope.get('headers', []))
        limit = 11 * 1024 * 1024 if scope['path'] == '/upload' else 256 * 1024

        async def secured_send(message):
            if message['type'] == 'http.response.start':
                message['headers'] = [*message.get('headers', []), (b'x-content-type-options', b'nosniff')]
            await send(message)

        async def reject(status, detail):
            await JSONResponse({'detail': detail}, status)(scope, receive, secured_send)

        try:
            length = int(headers.get(b'content-length', b'0'))
        except ValueError:
            await reject(400, 'Invalid content length')
            return
        if length < 0 or length > limit:
            await reject(413, 'Request body is too large')
            return
        body = bytearray()
        async def read_body():
            while True:
                message = await receive()
                if message['type'] == 'http.disconnect':
                    return False
                body.extend(message.get('body', b''))
                if len(body) > limit:
                    return False
                if not message.get('more_body', False):
                    return True
        try:
            complete = await asyncio.wait_for(read_body(), timeout=30)
        except TimeoutError:
            await reject(408, 'Request body timed out')
            return
        if not complete:
            if len(body) > limit:
                await reject(413, 'Request body is too large')
            return
        replayed = False
        async def replay():
            nonlocal replayed
            if not replayed:
                replayed = True
                return {'type': 'http.request', 'body': bytes(body), 'more_body': False}
            return await receive()
        await self.app(scope, replay, secured_send)
