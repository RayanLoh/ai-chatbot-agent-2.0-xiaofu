from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from google.auth import exceptions as auth_errors
from google.genai import types
from starlette.requests import Request
from config import Config
from main import app
from dependencies import get_request_identity
from core.agent import XiaofuAgent
from services.auth_service import CachedGoogleRequest, verify_google_id_token
from services.asset_service import OwnedStorage
from services.chat_service import generate_chat_response
from services.guest_usage_service import RequestIdentity
from test_chat import fixtures


def test_certificate_cache_obeys_ttl_and_bounds_network_timeout(monkeypatch):
    response=SimpleNamespace(status=200,data=b'{"kid":"cert"}',headers={'Cache-Control':'max-age=60'})
    transport=Mock(return_value=response)
    cached=CachedGoogleRequest(transport)
    clock=[0]
    monkeypatch.setattr('services.auth_service.time.monotonic',lambda:clock[0])
    assert cached('https://certs') is response
    assert cached('https://certs') is response
    assert transport.call_count==1
    assert transport.call_args.kwargs['timeout']==5
    clock[0]=61
    cached('https://certs')
    assert transport.call_count==2


def test_auth_transport_failure_is_not_an_invalid_session(monkeypatch):
    monkeypatch.setattr('services.auth_service.id_token.verify_oauth2_token',Mock(side_effect=auth_errors.TransportError('offline')))
    with pytest.raises(HTTPException) as error: verify_google_id_token('a.b.c')
    assert error.value.status_code==503
    assert error.value.detail['code']=='AUTH_SERVICE_UNAVAILABLE'


def test_certificate_transport_failures_do_not_stampede_upstream():
    transport=Mock(side_effect=auth_errors.TransportError('offline'))
    cached=CachedGoogleRequest(transport)
    for _ in range(2):
        with pytest.raises(auth_errors.TransportError): cached('https://certs')
    assert transport.call_count==1


def test_invalid_signature_still_returns_401(monkeypatch):
    monkeypatch.setattr('services.auth_service.id_token.verify_oauth2_token',Mock(side_effect=ValueError('signature')))
    with pytest.raises(HTTPException) as error: verify_google_id_token('a.b.c')
    assert error.value.status_code==401


def test_obvious_invalid_token_never_fetches_certificates(monkeypatch):
    verify=Mock()
    monkeypatch.setattr('services.auth_service.id_token.verify_oauth2_token',verify)
    with pytest.raises(HTTPException): verify_google_id_token('garbage')
    verify.assert_not_called()


async def test_network_rate_limit_precedes_google_verification(monkeypatch):
    verify=Mock()
    monkeypatch.setattr('dependencies.verify_google_id_token',verify)
    request=Request({'type':'http','headers':[(b'authorization',b'Bearer a.b.c')],'client':('127.0.0.1',1)})
    with pytest.raises(HTTPException) as error:
        await get_request_identity(request,SimpleNamespace(consume_usage=AsyncMock(return_value=False)))
    assert error.value.status_code==429
    verify.assert_not_called()


async def test_failed_guest_preflight_does_not_consume_trial():
    db,bot,req,identity,http=fixtures()
    identity=RequestIdentity('guest:test',True,'network')
    bot.get_response.side_effect=HTTPException(503,'not configured')
    with pytest.raises(HTTPException): await generate_chat_response(db,bot,None,identity,req,http)
    assert all(not call.args[0].startswith(('guest-total:','guest-network:')) for call in db.consume_usage.call_args_list)


async def test_new_chat_has_empty_history_without_loading_an_uncreated_conversation():
    db,bot,req,identity,http=fixtures()
    req.conversation_id=None
    await generate_chat_response(db,bot,None,identity,req,http)
    db.get_conversation.assert_not_called()
    assert len(bot.get_response.call_args.args[0])==1


@pytest.mark.parametrize('ref',['https://old.example/images/photo.png','/assets/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'])
async def test_missing_old_images_preserve_text_history_and_warn(monkeypatch,ref):
    class Client:
        def __init__(self,**kwargs): self.aio=self; self.models=self
        async def __aenter__(self): return self
        async def __aexit__(self,*args): pass
        count_tokens=AsyncMock(return_value=types.CountTokensResponse(total_tokens=10))
        generate_content=AsyncMock(return_value=types.GenerateContentResponse(candidates=[types.Candidate(
            content=types.Content(parts=[types.Part.from_text(text='Text still works')]))]))
    monkeypatch.setattr('core.agent.genai.Client',Client)
    monkeypatch.setattr(Config,'MODEL_BUDGETS',{'m':{'input':1,'output':2}})
    db=SimpleNamespace(get_asset=AsyncMock(side_effect=HTTPException(404,'missing')))
    storage=OwnedStorage(None,db,'user:test','conv')
    response=await XiaofuAgent('test','system').get_response([
        {'sender':'user','text':'Old question','images':[ref]}, {'sender':'user','text':'Continue'}], 'm',storage,AsyncMock())
    assert response['text']=='Text still works'
    assert response['warnings']==['HISTORY_IMAGES_UNAVAILABLE']
    if ref.startswith('https:'): db.get_asset.assert_not_called()


async def test_missing_new_attachment_is_not_silently_skipped(monkeypatch):
    monkeypatch.setattr(Config,'MODEL_BUDGETS',{'m':{'input':1,'output':2}})
    storage=SimpleNamespace(fetch_image=AsyncMock(side_effect=HTTPException(404,'missing')))
    reserve=AsyncMock()
    with pytest.raises(HTTPException) as error:
        await XiaofuAgent('test','system').get_response([{'sender':'user','text':'new','images':['/assets/id']}],'m',storage,reserve)
    assert error.value.status_code==404
    reserve.assert_not_called()


async def test_image_generation_without_storage_never_calls_provider(monkeypatch):
    model='gemini-nano-banana-2.1'
    monkeypatch.setattr(Config,'MODEL_BUDGETS',{model:{'input':1,'output':2,'image_micro_usd':1}})
    client=Mock()
    monkeypatch.setattr('core.agent.genai.Client',client)
    with pytest.raises(HTTPException) as error:
        await XiaofuAgent('test','system').get_response([{'text':'image'}],model,None,AsyncMock())
    assert error.value.status_code==503
    client.assert_not_called()


def test_readiness_is_explicitly_configuration_only(monkeypatch):
    monkeypatch.setattr(Config,'GEMINI_API_KEY',None)
    with TestClient(app) as client:
        assert client.get('/health').status_code==200
        response=client.get('/readiness')
    assert response.status_code==503
    assert response.json()['scope']=='configuration'
    assert not response.json()['checks']['generation_configured']


def test_catalog_selects_a_configured_default_and_reports_other_reasons(monkeypatch):
    monkeypatch.setattr(Config,'GEMINI_API_KEY','fake')
    monkeypatch.setattr(Config,'MODEL_BUDGETS',{Config.DEFAULT_MODEL:{'input':1,'output':2}})
    with TestClient(app) as client: data=client.get('/models').json()
    assert data['default_model']==Config.DEFAULT_MODEL
    assert data['model_options'][0]['available'] is True
    assert data['model_options'][1]['unavailable_reason']=='MODEL_BUDGET_NOT_CONFIGURED'
