import os
import json
from model_catalog import DEFAULT_MODELS


class Config:
    GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
    GOOGLE_CLIENT_ID = os.getenv('GOOGLE_CLIENT_ID')
    SUPABASE_URL = os.getenv('SUPABASE_URL')
    SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('SUPABASE_KEY')
    GUEST_SIGNING_SECRET = os.getenv('GUEST_SIGNING_SECRET', '')
    R2_ENDPOINT = os.getenv('R2_ENDPOINT_URL')
    R2_ID = os.getenv('R2_ACCESS_KEY_ID')
    R2_SECRET = os.getenv('R2_SECRET_ACCESS_KEY')
    R2_BUCKET = os.getenv('R2_BUCKET_NAME')
    MAX_IMAGE_BYTES = 10 * 1024 * 1024
    GENERATION_TIMEOUT = 120
    MAX_INPUT_TOKENS = int(os.getenv('MAX_INPUT_TOKENS', '16000'))
    MAX_OUTPUT_TOKENS = int(os.getenv('MAX_OUTPUT_TOKENS', '2048'))
    USER_DAILY_MICRO_USD = int(os.getenv('USER_DAILY_MICRO_USD', '1000000'))
    GLOBAL_MONTHLY_MICRO_USD = int(os.getenv('GLOBAL_MONTHLY_MICRO_USD', '10000000'))
    USER_DAILY_REQUESTS = int(os.getenv('USER_DAILY_REQUESTS', '50'))
    # Per-model worst-case USD / million tokens, plus image allowance micro USD.
    MODEL_BUDGETS = json.loads(os.getenv('MODEL_BUDGETS_JSON', '{}'))
    R2_PRIVATE_BUCKET_CONFIRMED = os.getenv('R2_PRIVATE_BUCKET_CONFIRMED', '').lower() == 'true'
    USER_DAILY_IMAGE_BYTES = int(os.getenv('USER_DAILY_IMAGE_BYTES', str(20 * 1024 * 1024)))
    GLOBAL_DAILY_IMAGE_BYTES = int(os.getenv('GLOBAL_DAILY_IMAGE_BYTES', str(200 * 1024 * 1024)))
    MAX_STORED_IMAGE_BYTES = int(os.getenv('MAX_STORED_IMAGE_BYTES', str(1024 * 1024 * 1024)))
    ALLOWED_MODELS = tuple(filter(None, (
        item.strip().removeprefix('models/')
        for item in os.getenv('ALLOWED_MODELS', ','.join(DEFAULT_MODELS)).split(',')
    )))

    DEFAULT_MODEL = ALLOWED_MODELS[0] if ALLOWED_MODELS else DEFAULT_MODELS[0]
    FREE_TRIAL_LIMIT = int(os.getenv('FREE_TRIAL_LIMIT', '20'))
    FREE_TRIAL_PERIOD = os.getenv('FREE_TRIAL_PERIOD', 'lifetime')
    PRO_DAILY_LIMIT = int(os.getenv('PRO_DAILY_LIMIT', '100'))
    PRO_DAILY_MICRO_USD = int(os.getenv('PRO_DAILY_MICRO_USD', '5000000'))
    FREE_MODELS = tuple(filter(None, (item.strip() for item in os.getenv('FREE_MODELS', DEFAULT_MODEL).split(','))))
    PRO_PRICE_USD = '4.99'
