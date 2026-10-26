from fastapi import APIRouter, Depends, Request
from dependencies import get_conversation_manager, get_request_identity
from services.guest_usage_service import RequestIdentity, consume_rate, issue_guest_token, network_id
from config import Config
from model_catalog import model_options
from services.model_availability import model_availability, configuration_readiness
from fastapi.responses import JSONResponse

router = APIRouter(tags=['sessions'])


def plan_catalog():
    return {'free_models': list(Config.FREE_MODELS), 'pro_limit': Config.PRO_DAILY_LIMIT,
        'guest_limit': 5,
        'free_limit': Config.FREE_TRIAL_LIMIT, 'free_period': Config.FREE_TRIAL_PERIOD,
        'checkout_available': False, 'template_only': True,
        'price': Config.PRO_PRICE_USD, 'currency': 'USD', 'payment_provider': 'paypal'}


@router.get('/billing/plans')
async def billing_plans():
    return plan_catalog()


@router.get('/billing/status')
async def billing_status(identity=Depends(get_request_identity), db=Depends(get_conversation_manager)):
    return {**await db.billing_status(identity.user_id), **plan_catalog()}


@router.post('/guest-session')
async def guest_session(request: Request, db=Depends(get_conversation_manager)):
    network = network_id(request)
    await consume_rate(db, RequestIdentity(f'issuance:{network}', True, network), 'session', 10)
    return {'token': issue_guest_token()}


@router.get('/models')
async def models():
    options = [{**option, **model_availability(option['value']),
        'access': 'free' if option['value'] in Config.FREE_MODELS else 'pro'}
        for option in model_options(Config.ALLOWED_MODELS)]
    default = next((option['value'] for option in options if option['available']), None)
    return {'models': list(Config.ALLOWED_MODELS), 'model_options': options, 'default_model': default}


@router.get('/readiness')
async def readiness():
    result = configuration_readiness()
    return JSONResponse(result, status_code=200 if result['ready'] else 503)
