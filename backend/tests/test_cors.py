import pytest
from fastapi.testclient import TestClient
from main import app


@pytest.mark.parametrize('origin', ['http://localhost:5174', 'http://127.0.0.1:5174'])
def test_local_preview_can_call_api(origin):
    response = TestClient(app).options('/models', headers={
        'Origin': origin, 'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'Authorization,X-Guest-Token',
    })
    assert response.status_code == 200
    assert response.headers['access-control-allow-origin'] == origin


def test_unknown_origin_remains_blocked():
    response = TestClient(app).options('/models', headers={
        'Origin': 'https://untrusted.example', 'Access-Control-Request-Method': 'GET',
    })
    assert response.status_code == 400
    assert 'access-control-allow-origin' not in response.headers
