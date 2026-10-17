import io
import ipaddress
import socket
import time
from urllib.parse import urlsplit
import httpx
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


def validate_image_url(url: str) -> str:
    base = urlsplit(Config.R2_PUBLIC_URL)
    try:
        parsed = urlsplit(url)
        # Only application-owned opaque keys; no arbitrary URL proxying.
        import re
        prefix = base.path.rstrip('/') + '/images/'
        key = parsed.path.removeprefix(prefix)
        if (base.scheme != 'https' or not base.hostname or
                parsed.scheme != 'https' or parsed.hostname != base.hostname or
                parsed.port not in (None, 443) or base.port not in (None, 443) or
                parsed.username or parsed.password or parsed.query or parsed.fragment or
                not parsed.path.startswith(prefix) or
                not re.fullmatch(r'[0-9a-f-]{36}\.(png|jpg|webp|gif)', key)):
            raise ValueError()
    except ValueError:
        raise HTTPException(400, 'Image URL must refer to application storage') from None
    return url


def fetch_image(url: str) -> tuple[bytes, str]:
    validate_image_url(url)
    hostname = urlsplit(url).hostname
    try:
        addresses = socket.getaddrinfo(hostname, 443, type=socket.SOCK_STREAM)
        if not addresses or any(not ipaddress.ip_address(row[4][0]).is_global for row in addresses):
            raise HTTPException(400, 'Storage address must be public')
        # Pin the validated address to prevent DNS rebinding. Keep TLS hostname
        # verification and SNI against the original hostname.
        address = addresses[0][4][0]
        authority = f'[{address}]' if ':' in address else address
        parsed = urlsplit(url)
        pinned = f'https://{authority}{parsed.path}'
        started = time.monotonic()
        with httpx.Client(timeout=httpx.Timeout(10, connect=5), follow_redirects=False, trust_env=False) as client:
            with client.stream('GET', pinned, headers={'Host': hostname},
                               extensions={'sni_hostname': hostname}) as response:
                if response.status_code != 200:
                    raise HTTPException(400, 'Unable to fetch stored image')
                if int(response.headers.get('content-length', '0')) > Config.MAX_IMAGE_BYTES:
                    raise HTTPException(413, 'Stored image is too large')
                data = bytearray()
                for chunk in response.iter_bytes(65536):
                    data.extend(chunk)
                    if len(data) > Config.MAX_IMAGE_BYTES:
                        raise HTTPException(413, 'Stored image is too large')
                    if time.monotonic() - started > 20:
                        raise HTTPException(504, 'Image download timed out')
                content = bytes(data)
                return content, validate_image(content, response.headers.get('content-type'))
    except HTTPException:
        raise
    except (httpx.HTTPError, OSError, ValueError):
        raise HTTPException(502, 'Unable to fetch stored image') from None
