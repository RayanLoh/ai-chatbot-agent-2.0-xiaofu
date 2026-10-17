from fastapi.testclient import TestClient
from main import app
from config import Config
from model_catalog import is_image_model, model_options
from schemas.chat import ChatRequest
from uuid import uuid4


def test_model_endpoint_exposes_labels_for_only_allowed_models():
    with TestClient(app) as client:
        data = client.get('/models').json()
    assert data['default_model'] is None
    assert all(not item['available'] for item in data['model_options'])
    assert [item['value'] for item in data['model_options']] == data['models']
    assert 'gemini-3-pro-preview' not in data['models']
    assert 'gemini-2.5-flash' not in data['models']


def test_nano_banana_without_image_in_name_requests_image_output():
    assert is_image_model('gemini-nano-banana-2.1')
    assert is_image_model('models/gemini-nano-banana-2.1')
    assert not is_image_model('gemini-4-argon')


def test_default_chat_model_matches_endpoint():
    assert ChatRequest(prompt='Hi', request_id=uuid4()).model_name == Config.DEFAULT_MODEL


def test_custom_allowlist_gets_safe_fallback_labels():
    assert model_options(['custom-model'])[0]['value'] == 'custom-model'
    assert len(model_options(['gemini-3.8-flash'])) == 1
