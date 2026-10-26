import asyncio
import uuid
import logging
from datetime import datetime, timezone
from fastapi import HTTPException
from supabase import create_client
from config import Config
from services.observability import log_failure

logger = logging.getLogger(__name__)


class ConversationManager:
    def __init__(self):
        self.supabase = create_client(Config.SUPABASE_URL, Config.SUPABASE_KEY) if Config.SUPABASE_URL and Config.SUPABASE_KEY else None

    async def _execute(self, make_query, *, missing_codes=(), missing_value=None):
        if self.supabase is None:
            raise HTTPException(503, 'Database is not configured')
        try:
            return (await asyncio.to_thread(lambda: make_query(self.supabase).execute())).data
        except Exception as error:
            if getattr(error, 'code', None) in missing_codes:
                return missing_value
            operation = getattr(make_query, '__qualname__', 'database').split('.<locals>')[0]
            log_failure(logger, operation, error)
            # Do not leak database internals or translate failures to empty data.
            raise HTTPException(503, 'Database operation failed. Please retry.') from None

    async def create_conversation(self, user_id: str, title: str = 'New Conversation') -> str:
        conv_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        await self._execute(lambda db: db.table('conversations').insert({
            'id': conv_id, 'user_id': user_id, 'title': title, 'messages': [],
            'created_at': now, 'updated_at': now,
        }))
        return conv_id

    async def get_user_conversations(self, user_id: str):
        rows = await self._execute(lambda db: db.rpc('list_conversation_summaries', {'p_user_id': user_id}))
        return rows or []

    async def read_owned_history(self, identity, conversation_id=None):
        return await self._execute(lambda db: db.rpc('read_owned_history', {
            'p_owner': identity.user_id, 'p_network': identity.network_id,
            'p_bucket': int(datetime.now(timezone.utc).timestamp()) // 60,
            'p_conv': conversation_id,
        }), missing_codes=('PGRST202',))

    async def get_conversation(self, conv_id: str, user_id: str):
        rows = await self._execute(lambda db: db.table('conversations').select('id,user_id,title,updated_at,messages').eq('id', conv_id).eq('user_id', user_id).limit(1))
        return rows[0] if rows else None

    async def get_messages(self, conv_id: str, user_id: str):
        conversation = await self.get_conversation(conv_id, user_id)
        return conversation.get('messages', []) if conversation else None

    async def add_message(self, conv_id: str, user_id: str, sender: str, text: str, images=None, request_id=None):
        message = {'id': str(uuid.uuid4()), 'sender': sender, 'text': text, 'images': images or [], 'timestamp': datetime.now(timezone.utc).isoformat()}
        saved = await self._execute(lambda db: db.rpc('append_conversation_message', {
            'p_conv_id': conv_id, 'p_user_id': user_id, 'p_message': message,
            'p_request_id': request_id,
        }))
        if not saved:
            raise HTTPException(409, 'Conversation was removed or generation was cancelled')
        return True

    async def update_title(self, conv_id: str, user_id: str, new_title: str):
        rows = await self._execute(lambda db: db.table('conversations').update({
            'title': new_title, 'updated_at': datetime.now(timezone.utc).isoformat(),
        }).eq('id', conv_id).eq('user_id', user_id))
        return bool(rows)

    async def delete_conversation(self, conv_id: str, user_id: str):
        return bool(await self._execute(lambda db: db.rpc('delete_owned_conversation', {'p_conv': conv_id, 'p_owner': user_id})))

    async def start_job(self, request_id, user_id, conv_id, payload_hash):
        return await self._execute(lambda db: db.rpc('start_generation', {
            'p_id': request_id, 'p_owner': user_id, 'p_conv': conv_id, 'p_hash': payload_hash,
        }))

    async def get_job(self, request_id, user_id):
        rows = await self._execute(lambda db: db.table('generation_requests').select(
            'request_id,conversation_id,active,expires_at,result,failure,usage'
        ).eq('request_id', request_id).eq('user_id', user_id).limit(1))
        if not rows:
            return None
        job = rows[0]
        expired = datetime.fromisoformat(job['expires_at'].replace('Z', '+00:00')) <= datetime.now(timezone.utc)
        job['status'] = 'succeeded' if job['result'] is not None else 'running' if job['active'] and not expired else 'failed'
        return job

    async def billing_status(self, user_id):
        return await self._execute(lambda db: db.rpc('get_billing_status', {
            'p_owner': user_id, 'p_free': Config.FREE_TRIAL_LIMIT,
            'p_pro': Config.PRO_DAILY_LIMIT, 'p_period': Config.FREE_TRIAL_PERIOD,
        }))

    async def bind_tester_account(self, user_id, email):
        # Keep existing logins working during the migration rollout. Missing
        # allowlist RPC never grants test access; all other failures propagate.
        await self._execute(lambda db: db.rpc('bind_tester_account', {'p_user': user_id, 'p_email': email}),
            missing_codes=('PGRST202',))

    async def guest_history_claimed(self, guest_id):
        rows = await self._execute(lambda db: db.table('guest_history_claims').select('guest_id').eq('guest_id', guest_id).limit(1),
            missing_codes=('PGRST205', '42P01'), missing_value=[])
        return bool(rows)

    async def claim_guest_history(self, guest_id, user_id):
        return await self._execute(lambda db: db.rpc('claim_guest_history', {'p_guest': guest_id, 'p_user': user_id}))

    async def reserve_budget(self, request_id, user_id, cost, model_name, network_id=None):
        result = await self._execute(lambda db: db.rpc('admit_plan_generation', {
            'p_id': request_id, 'p_owner': user_id, 'p_model': model_name, 'p_cost': cost,
            'p_free': Config.FREE_TRIAL_LIMIT, 'p_pro': Config.PRO_DAILY_LIMIT,
            'p_period': Config.FREE_TRIAL_PERIOD, 'p_free_models': list(Config.FREE_MODELS),
            'p_free_daily': Config.USER_DAILY_MICRO_USD, 'p_pro_daily': Config.PRO_DAILY_MICRO_USD,
            'p_monthly': Config.GLOBAL_MONTHLY_MICRO_USD,
            'p_request_cap': max(Config.USER_DAILY_REQUESTS, Config.PRO_DAILY_LIMIT),
            'p_network': network_id,
        }))
        code = result['code']
        if code != 'OK':
            messages = {
                'SUBSCRIPTION_REQUIRED': 'Upgrade to Pro to continue.',
                'PLAN_LIMIT_REACHED': 'Your Pro daily limit has been reached.',
                'BUDGET_LIMIT_REACHED': 'Service capacity reached. Please try again later.',
                'GENERATION_UNAVAILABLE': 'Generation is no longer active.',
                'GUEST_LIMIT_REACHED': 'Guest trial finished. Please sign in with Google to continue chatting.',
            }
            raise HTTPException(402 if code == 'SUBSCRIPTION_REQUIRED' else 409 if code == 'GENERATION_UNAVAILABLE' else 403 if code == 'GUEST_LIMIT_REACHED' else 429,
                {'code': code, 'detail': messages.get(code, 'Unable to admit request.'),
                 'quota': result.get('quota'), 'reason': result.get('reason')})

    async def complete_job(self, request_id, user_id, prompt, images, response, conv_id):
        now = datetime.now(timezone.utc).isoformat()
        result = {**response, 'conversation_id': conv_id, 'request_id': request_id}
        saved = await self._execute(lambda db: db.rpc('complete_generation', {
            'p_id': request_id, 'p_owner': user_id,
            'p_user': {'id': request_id + ':user', 'sender': 'user', 'text': prompt, 'images': images, 'timestamp': now},
            'p_bot': {'id': request_id + ':bot', 'sender': 'bot', 'text': response['text'], 'images': response['images'], 'warnings': response.get('warnings', []), 'timestamp': now},
            'p_result': result,
        }))
        if not saved:
            raise HTTPException(409, 'Generation cancelled or conversation removed')
        return result

    async def create_asset(self, asset_id, user_id, key, size):
        allowed = await self._execute(lambda db: db.rpc('reserve_asset_upload', {
            'p_id': asset_id, 'p_owner': user_id, 'p_key': key, 'p_bytes': size,
            'p_user_limit': Config.USER_DAILY_IMAGE_BYTES, 'p_global_limit': Config.GLOBAL_DAILY_IMAGE_BYTES,
            'p_stored_limit': Config.MAX_STORED_IMAGE_BYTES,
        }))
        if not allowed:
            raise HTTPException(429, 'Image storage quota reached. Please try again later.')

    async def ready_asset(self, asset_id, user_id):
        return bool(await self._execute(lambda db: db.table('assets').update({'state': 'ready'}).eq('id', asset_id).eq('user_id', user_id).eq('state', 'pending')))

    async def get_asset(self, asset_id, user_id):
        rows = await self._execute(lambda db: db.table('assets').select('*').eq('id', asset_id).eq('user_id', user_id).eq('state', 'ready').limit(1))
        if not rows:
            raise HTTPException(404, 'Image not found')
        return rows[0]

    async def consume_usage(self, key: str, limit: int):
        return bool(await self._execute(lambda db: db.rpc('consume_usage', {'p_key': key, 'p_limit': limit})))

    async def begin_generation(self, request_id: str, conv_id: str, user_id: str):
        return bool(await self._execute(lambda db: db.rpc('begin_generation', {
            'p_request_id': request_id, 'p_conv_id': conv_id, 'p_user_id': user_id,
        })))

    async def generation_active(self, request_id: str, user_id: str):
        rows = await self._execute(lambda db: db.table('generation_requests').select('request_id').eq('request_id', request_id).eq('user_id', user_id).eq('active', True).gt('expires_at', datetime.now(timezone.utc).isoformat()))
        return bool(rows)

    async def finish_generation(self, request_id: str, user_id: str):
        rows = await self._execute(lambda db: db.table('generation_requests').update({'active': False}).eq('request_id', request_id).eq('user_id', user_id).eq('active', True))
        return bool(rows)

    async def cancel_generation(self, request_id: str, user_id: str):
        return bool(await self._execute(lambda db: db.rpc("cancel_generation", {"p_request_id": request_id, "p_user_id": user_id})))
