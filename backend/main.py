import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from services.request_limits import BodyLimitMiddleware
from bootstrap import load_app_environment
load_app_environment()

from routers.chat import router as chat_router
from routers.conversations import router as conversations_router
from routers.uploads import router as uploads_router
from routers.sessions import router as sessions_router

app = FastAPI(title='Xiaofu API')


def _build_cors_origins():
    origins = {f'http://{host}:{port}' for host in ('localhost', '127.0.0.1')
               for port in (5173, 5174, 4173)}
    origins.update(value.strip().rstrip('/') for value in os.getenv('FRONTEND_ORIGIN', '').split(',') if value.strip())
    return sorted(origins)


app.add_middleware(BodyLimitMiddleware)
app.add_middleware(CORSMiddleware, allow_origins=_build_cors_origins(),
                   allow_credentials=False, allow_methods=['GET', 'POST', 'PUT', 'DELETE'],
                   allow_headers=['Content-Type', 'Authorization', 'X-Guest-Token'])


@app.get('/health')
async def health():
    return {'status': 'ok'}


app.include_router(sessions_router)
app.include_router(conversations_router)
app.include_router(chat_router)
app.include_router(uploads_router)

if __name__ == '__main__':
    import uvicorn
    uvicorn.run('main:app', host='0.0.0.0', port=int(os.getenv('PORT', '8080')))
