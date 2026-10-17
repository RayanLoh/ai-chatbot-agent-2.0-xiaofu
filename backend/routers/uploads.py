from fastapi import APIRouter, Depends, File, UploadFile, HTTPException
from config import Config
from dependencies import get_storage_service, get_request_identity, get_conversation_manager
from services.guest_usage_service import consume_rate
from services.asset_service import OwnedStorage
from fastapi.responses import Response

router = APIRouter(tags=['uploads'])


@router.get('/download-image')
async def download_image(url: str, identity=Depends(get_request_identity), db=Depends(get_conversation_manager), storage=Depends(get_storage_service)):
    await consume_rate(db, identity, 'download', 20)
    content, mime = await OwnedStorage(storage, db, identity.user_id).fetch_image(url)
    return Response(content, media_type=mime, headers={
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'inline; filename="xiaofu-image"',
    })


@router.post('/upload')
async def upload_image_route(file: UploadFile = File(...), storage=Depends(get_storage_service),
                             identity=Depends(get_request_identity), db=Depends(get_conversation_manager)):
    await consume_rate(db, identity, 'upload', 10)
    try:
        content = await file.read(Config.MAX_IMAGE_BYTES + 1)
        if len(content) > Config.MAX_IMAGE_BYTES:
            raise HTTPException(413, 'Images must be at most 10 MiB')
        url = await OwnedStorage(storage, db, identity.user_id).upload_image(content, file.content_type)
        return {'url': url}
    finally:
        await file.close()
