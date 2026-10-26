import io
from fastapi import HTTPException
from PIL import Image, UnidentifiedImageError
from config import Config

MIME_FORMATS = {'PNG': 'image/png', 'JPEG': 'image/jpeg', 'WEBP': 'image/webp', 'GIF': 'image/gif'}
Image.MAX_IMAGE_PIXELS = 20_000_000


def validate_image(data: bytes, declared_type: str | None = None) -> str:
    if not data or len(data) > Config.MAX_IMAGE_BYTES:
        raise HTTPException(413, 'Images must be between 1 byte and 10 MiB')
    try:
        import warnings
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as image:
                mime = MIME_FORMATS.get(image.format)
                if not mime:
                    raise ValueError('Unsupported format')
                image.verify()
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombWarning, Image.DecompressionBombError):
        raise HTTPException(415, 'Only valid PNG, JPEG, WebP and GIF images are supported') from None
    if declared_type and declared_type.split(';')[0].strip().lower() != mime:
        raise HTTPException(415, 'Image type does not match its contents')
    return mime
