from dataclasses import dataclass
import json
import re
import threading
import time

from fastapi import HTTPException
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2 import id_token
from google.auth import exceptions as auth_errors

from config import Config


INVALID_AUTH_ERROR_CODE = "INVALID_AUTH_TOKEN"
INVALID_AUTH_ERROR_REASON = "invalid_auth_token"
INVALID_AUTH_ERROR_DETAIL = "Session expired or invalid. Please sign in with Google again."

class CachedGoogleRequest:
    """Cache successful certificate GETs; serialize refresh and bound network IO."""
    def __init__(self, transport=None):
        self.transport = transport or GoogleAuthRequest()
        self.cache = {}
        self.lock = threading.Lock()
        self.retry_at = 0

    def __call__(self, url, method='GET', **kwargs):
        if not self.lock.acquire(timeout=6):
            raise auth_errors.TransportError('Certificate refresh busy')
        try:
            cached = self.cache.get(url)
            if method == 'GET' and cached and cached[0] > time.monotonic():
                return cached[1]
            if time.monotonic() < self.retry_at:
                raise auth_errors.TransportError('Certificate refresh cooling down')
            kwargs['timeout'] = 5
            response = self.transport(url, method=method, **kwargs)
            if response.status != 200:
                raise auth_errors.TransportError('Certificate service unavailable')
            # Do not cache malformed upstream responses as invalid user tokens.
            if not isinstance(json.loads(response.data), dict):
                raise auth_errors.TransportError('Invalid certificate response')
            headers = {key.lower(): value for key, value in response.headers.items()}
            control = headers.get('cache-control', '')
            match = re.search(r'(?:^|,)\s*max-age=(\d+)', control)
            ttl = min(int(match.group(1)), 300) if match else 300
            if method == 'GET' and 'no-store' not in control and 'no-cache' not in control:
                self.cache[url] = (time.monotonic() + ttl, response)
            return response
        except auth_errors.TransportError:
            if time.monotonic() >= self.retry_at:
                self.retry_at = time.monotonic() + 5
            raise
        except Exception:
            self.retry_at = time.monotonic() + 5
            raise auth_errors.TransportError('Certificate service unavailable') from None
        finally:
            self.lock.release()


_google_request = CachedGoogleRequest()


@dataclass(frozen=True)
class VerifiedGoogleUser:
    sub: str
    email: str | None = None
    name: str | None = None
    email_verified: bool = False


def extract_bearer_token(auth_header: str | None) -> str | None:
    if not auth_header:
        return None

    prefix = "Bearer "
    if not auth_header.startswith(prefix):
        raise HTTPException(
            status_code=401,
            detail={
                "detail": INVALID_AUTH_ERROR_DETAIL,
                "code": INVALID_AUTH_ERROR_CODE,
                "reason": INVALID_AUTH_ERROR_REASON,
            },
        )

    token = auth_header[len(prefix):].strip()
    if not token:
        raise HTTPException(401, detail={"detail": INVALID_AUTH_ERROR_DETAIL, "code": INVALID_AUTH_ERROR_CODE})
    return token


def verify_google_id_token(token: str) -> VerifiedGoogleUser:
    client_id = Config.GOOGLE_CLIENT_ID
    if not client_id:
        raise HTTPException(503, 'Google sign-in is not configured')

    if len(token) > 8192 or not re.fullmatch(r'[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', token):
        raise HTTPException(401, {'detail': INVALID_AUTH_ERROR_DETAIL, 'code': INVALID_AUTH_ERROR_CODE})

    try:
        claims = id_token.verify_oauth2_token(token, _google_request, client_id)
    except (ValueError, auth_errors.InvalidValue, auth_errors.MalformedError):
        # Token and provider details must not be logged.
        raise HTTPException(
            status_code=401,
            detail={
                "detail": INVALID_AUTH_ERROR_DETAIL,
                "code": INVALID_AUTH_ERROR_CODE,
                "reason": INVALID_AUTH_ERROR_REASON,
            },
        ) from None
    except Exception:
        raise HTTPException(503, {'detail': 'Google verification is temporarily unavailable. Please retry.',
            'code': 'AUTH_SERVICE_UNAVAILABLE'}) from None

    issuer = claims.get("iss")
    if issuer not in {"accounts.google.com", "https://accounts.google.com"}:
        raise HTTPException(
            status_code=401,
            detail={
                "detail": INVALID_AUTH_ERROR_DETAIL,
                "code": INVALID_AUTH_ERROR_CODE,
                "reason": INVALID_AUTH_ERROR_REASON,
            },
        )

    subject = claims.get("sub")
    if not subject:
        raise HTTPException(
            status_code=401,
            detail={
                "detail": INVALID_AUTH_ERROR_DETAIL,
                "code": INVALID_AUTH_ERROR_CODE,
                "reason": INVALID_AUTH_ERROR_REASON,
            },
        )

    return VerifiedGoogleUser(
        sub=subject,
        email=claims.get("email"),
        name=claims.get("name"),
        email_verified=claims.get("email_verified") is True,
    )
