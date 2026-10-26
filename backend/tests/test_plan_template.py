from fastapi.testclient import TestClient
from main import app


def test_catalog_has_requested_trial_and_draft_price_but_no_checkout():
    with TestClient(app) as client:
        data=client.get('/billing/plans').json()
    assert data['free_limit']==20
    assert data['guest_limit']==5
    assert data['free_period']=='lifetime'
    assert data['price']=='4.99' and data['currency']=='USD'
    assert data['template_only'] is True
    assert data['checkout_available'] is False


def test_template_does_not_expose_payment_or_activation_routes():
    with TestClient(app) as client:
        for path in ('/billing/paypal/checkout','/billing/paypal/webhook','/billing/paypal/sync'):
            assert client.post(path,json={}).status_code==404
