from fastapi import HTTPException
from config import Config
from core.agent import maximum_cost
from model_catalog import is_image_model


def model_availability(model):
    if not Config.GEMINI_API_KEY:
        return {'available': False, 'unavailable_reason': 'AI_NOT_CONFIGURED'}
    try:
        maximum_cost(model, 0)
    except HTTPException:
        return {'available': False, 'unavailable_reason': 'MODEL_BUDGET_NOT_CONFIGURED'}
    if is_image_model(model) and not private_storage_configured():
        return {'available': False, 'unavailable_reason': 'PRIVATE_STORAGE_NOT_CONFIGURED'}
    return {'available': True, 'unavailable_reason': None}


def private_storage_configured():
    return bool(Config.R2_PRIVATE_BUCKET_CONFIRMED and all((Config.R2_ENDPOINT, Config.R2_ID,
        Config.R2_SECRET, Config.R2_BUCKET)))


def configuration_readiness():
    models = {model: model_availability(model) for model in Config.ALLOWED_MODELS}
    checks = {'database_configured': bool(Config.SUPABASE_URL and Config.SUPABASE_KEY),
        'guest_signing_configured': len(Config.GUEST_SIGNING_SECRET) >= 32,
        'generation_configured': any(item['available'] for item in models.values()),
        'private_storage_configured': private_storage_configured(),
        'google_sign_in_configured': bool(Config.GOOGLE_CLIENT_ID)}
    # Text chat can be ready without image storage or Google sign-in.
    ready = all(checks[key] for key in ('database_configured','guest_signing_configured','generation_configured'))
    return {'ready': ready, 'scope': 'configuration', 'checks': checks, 'models': models}
