"""Scheduled private-object reclamation. Run hourly with backend environment."""
import asyncio
import logging
from datetime import datetime, timedelta, timezone
from bootstrap import load_app_environment
load_app_environment()
from services.supabase_db import ConversationManager
from services.r2_storage import R2Service


async def cleanup(db, storage):
    if not storage.s3_client:
        raise RuntimeError('R2 is not configured')
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    # Mark first. A late upload cannot become ready after reclamation starts.
    await db._execute(lambda c: c.table('assets').update({'state': 'deleting'})
        .is_('conversation_id', 'null').lt('created_at', cutoff))
    rows = await db._execute(lambda c: c.rpc('claim_asset_cleanup', {'p_limit': 100}))
    deleted = failed = 0
    for row in rows:
        try:
            await asyncio.to_thread(storage.s3_client.delete_object, Bucket=storage.bucket, Key=row['object_key'])
            await db._execute(lambda c: c.table('assets').delete().eq('id', row['id']).eq('state', 'deleting'))
            deleted += 1
        except Exception:
            failed += 1
            logging.warning('Asset cleanup failed; queued for next scheduled run')
    return {'deleted': deleted, 'failed': failed}


if __name__ == '__main__':
    result = asyncio.run(cleanup(ConversationManager(), R2Service()))
    logging.warning('Cleanup result: %s', result)
    raise SystemExit(1 if result['failed'] else 0)
