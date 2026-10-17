import asyncio
import hashlib
import re
import uuid
from fastapi import HTTPException
from config import Config
from services.image_security import validate_image


def asset_id(reference):
    if not isinstance(reference, str) or not re.fullmatch(r'/assets/[0-9a-f-]{36}', reference):
        raise HTTPException(400, 'Only owned private image references are accepted')
    try:
        return str(uuid.UUID(reference[8:]))
    except ValueError:
        raise HTTPException(400, 'Invalid image reference') from None


class OwnedStorage:
    def __init__(self, storage, db, user_id, conversation_id=None):
        self.storage, self.db, self.user_id = storage, db, user_id
        self.conversation_id = conversation_id

    async def check_image(self, reference):
        row = await self.db.get_asset(asset_id(reference), self.user_id)
        if self.conversation_id and row['conversation_id'] not in (None, self.conversation_id):
            raise HTTPException(409, 'Image belongs to another conversation')
        return row

    async def fetch_image(self, reference):
        row = await self.check_image(reference)
        return await asyncio.to_thread(self.storage.read_image, row['object_key'])

    async def upload_image(self, content, mime='image/png'):
        if not Config.R2_PRIVATE_BUCKET_CONFIRMED or not self.storage.s3_client:
            raise HTTPException(503, 'Private image storage is not configured')
        mime = validate_image(content, mime)
        ident = str(uuid.uuid4())
        # Stable server-derived namespaces; never put emails or client-supplied
        # paths into object keys. Hash the full identity to separate all issuers.
        group = 'guests' if self.user_id.startswith('guest:') else 'users'
        owner = hashlib.sha256(self.user_id.encode('utf-8')).hexdigest()
        key = f'private/{group}/{owner}/{ident}'
        # Record first: interrupted uploads remain reclaimable.
        await self.db.create_asset(ident, self.user_id, key, len(content))
        await asyncio.to_thread(self.storage.write_image, key, content, mime)
        if not await self.db.ready_asset(ident, self.user_id):
            raise HTTPException(409, 'Upload expired. Please upload again.')
        return '/assets/' + ident
