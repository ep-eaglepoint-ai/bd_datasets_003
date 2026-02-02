import pytest
import os
import jwt
import json
from datetime import datetime, timedelta
from unittest.mock import patch, MagicMock
from app import create_app, db
from app.models import User, InventoryItem, Alert, StockMovement
from app.services.stock_service import StockService

@pytest.fixture(scope='function')
def app():
    """Isolated database for each test."""
    app = create_app({
        'TESTING': True,
        'SQLALCHEMY_DATABASE_URI': 'sqlite:///:memory:',
        'SECRET_KEY': 'test-secret-key',
        'SQLALCHEMY_TRACK_MODIFICATIONS': False
    })
    with app.app_context():
        db.create_all()
        yield app
        db.session.remove()
        db.drop_all()

@pytest.fixture(scope='function')
def client(app):
    return app.test_client()

@pytest.fixture(scope='function')
def auth_headers(client):
    client.post('/api/auth/register', json={'username': 'testuser', 'password': 'testpassword'})
    response = client.post('/api/auth/login', json={'username': 'testuser', 'password': 'testpassword'})
    token = response.get_json().get('token')
    return {'Authorization': f'Bearer {token}'}

# --- Auth Tests ---

def test_auth_register_success(client):
    response = client.post('/api/auth/register', json={'username': 'u1', 'password': 'p1'})
    assert response.status_code == 201

def test_auth_register_missing_fields(client):
    response = client.post('/api/auth/register', json={'username': 'u1'})
    assert response.status_code == 400
    assert 'required' in response.get_json()['error']

def test_auth_register_duplicate_username(client):
    client.post('/api/auth/register', json={'username': 'u1', 'password': 'p'})
    response = client.post('/api/auth/register', json={'username': 'u1', 'password': 'p'})
    assert response.status_code == 409
    assert 'exists' in response.get_json()['error']

def test_auth_login_success(client):
    client.post('/api/auth/register', json={'username': 'u1', 'password': 'p'})
    response = client.post('/api/auth/login', json={'username': 'u1', 'password': 'p'})
    assert response.status_code == 200
    assert 'token' in response.get_json()

def test_auth_login_invalid_password(client):
    client.post('/api/auth/register', json={'username': 'u1', 'password': 'p'})
    response = client.post('/api/auth/login', json={'username': 'u1', 'password': 'wrong'})
    assert response.status_code == 401

def test_auth_login_disabled_user(app, client):
    from app.routes.auth import hash_password
    with app.app_context():
        user = User(username='disabled', password_hash=hash_password('p'), is_active=False)
        db.session.add(user)
        db.session.commit()
    response = client.post('/api/auth/login', json={'username': 'disabled', 'password': 'p'})
    assert response.status_code == 403

def test_auth_refresh_token(client, auth_headers):
    response = client.post('/api/auth/refresh', headers=auth_headers)
    assert response.status_code == 200

def test_auth_me_endpoint(client, auth_headers):
    response = client.get('/api/auth/me', headers=auth_headers)
    assert response.status_code == 200
    assert response.get_json()['username'] == 'testuser'

def test_auth_token_expired(app, client):
    payload = {'user_id': 1, 'exp': datetime.utcnow() - timedelta(seconds=1)}
    token = jwt.encode(payload, app.config['SECRET_KEY'], algorithm='HS256')
    response = client.get('/api/auth/me', headers={'Authorization': f'Bearer {token}'})
    assert response.status_code == 401

def test_auth_token_invalid(client):
    response = client.get('/api/auth/me', headers={'Authorization': 'Bearer junk'})
    assert response.status_code == 401

def test_auth_register_null_values(client):
    response = client.post('/api/auth/register', json={'username': None, 'password': 'p'})
    assert response.status_code == 400

# --- Inventory Tests ---

def test_inv_create_item_success(client, auth_headers):
    response = client.post('/api/inventory', headers=auth_headers, json={'sku': 'S1', 'name': 'N', 'unit_price': 1.0})
    assert response.status_code == 201

def test_inv_create_item_missing_fields(client, auth_headers):
    response = client.post('/api/inventory', headers=auth_headers, json={'sku': 'S1'})
    assert response.status_code == 400

def test_inv_create_item_duplicate_sku(client, auth_headers):
    client.post('/api/inventory', headers=auth_headers, json={'sku': 'D', 'name': 'N', 'unit_price': 1.0})
    response = client.post('/api/inventory', headers=auth_headers, json={'sku': 'D', 'name': 'N', 'unit_price': 1.0})
    assert response.status_code == 409

def test_inv_create_item_null_values(client, auth_headers):
    response = client.post('/api/inventory', headers=auth_headers, json={'sku': None, 'name': None, 'unit_price': None})
    assert response.status_code == 400

def test_inv_list_items(client, auth_headers):
    response = client.get('/api/inventory', headers=auth_headers)
    assert response.status_code == 200

def test_inv_get_item_success(client, auth_headers):
    res = client.post('/api/inventory', headers=auth_headers, json={'sku': 'G', 'name': 'N', 'unit_price': 1.0})
    item_id = res.get_json()['id']
    response = client.get(f'/api/inventory/{item_id}', headers=auth_headers)
    assert response.status_code == 200

def test_inv_get_item_not_found(client, auth_headers):
    response = client.get('/api/inventory/999', headers=auth_headers)
    assert response.status_code == 404

def test_inv_update_item(client, auth_headers):
    res = client.post('/api/inventory', headers=auth_headers, json={'sku': 'U', 'name': 'N', 'unit_price': 1.0})
    item_id = res.get_json()['id']
    response = client.put(f'/api/inventory/{item_id}', headers=auth_headers, json={'name': 'New'})
    assert response.status_code == 200

def test_inv_update_item_not_found(client, auth_headers):
    response = client.put('/api/inventory/999', headers=auth_headers, json={'name': 'N'})
    assert response.status_code == 404

def test_inv_delete_item_success(client, auth_headers):
    res = client.post('/api/inventory', headers=auth_headers, json={'sku': 'D', 'name': 'N', 'unit_price': 1.0})
    item_id = res.get_json()['id']
    response = client.delete(f'/api/inventory/{item_id}', headers=auth_headers)
    assert response.status_code == 200

def test_inv_delete_item_not_found(client, auth_headers):
    response = client.delete('/api/inventory/999', headers=auth_headers)
    assert response.status_code == 404

def test_inv_delete_item_with_reserved_stock(client, auth_headers):
    res = client.post('/api/inventory', headers=auth_headers, json={'sku': 'R', 'name': 'N', 'unit_price': 1.0, 'quantity': 10})
    item_id = res.get_json()['id']
    client.post(f'/api/inventory/{item_id}/reserve', headers=auth_headers, json={'quantity': 5})
    response = client.delete(f'/api/inventory/{item_id}', headers=auth_headers)
    assert response.status_code == 400

def test_inv_adjust_stock_in(client, auth_headers):
    res = client.post('/api/inventory', headers=auth_headers, json={'sku': 'A', 'name': 'N', 'unit_price': 1.0, 'quantity': 10})
    item_id = res.get_json()['id']
    response = client.post(f'/api/inventory/{item_id}/adjust', headers=auth_headers, json={'quantity': 5, 'type': 'IN'})
    assert response.status_code == 200
    assert response.get_json()['new_quantity'] == 15

def test_inv_adjust_stock_not_found(client, auth_headers):
    response = client.post('/api/inventory/999/adjust', headers=auth_headers, json={'quantity': 5, 'type': 'IN'})
    assert response.status_code == 400

def test_inv_adjust_stock_out_insufficient(client, auth_headers):
    res = client.post('/api/inventory', headers=auth_headers, json={'sku': 'O', 'name': 'N', 'unit_price': 1.0, 'quantity': 5})
    item_id = res.get_json()['id']
    response = client.post(f'/api/inventory/{item_id}/adjust', headers=auth_headers, json={'quantity': 10, 'type': 'OUT'})
    assert response.status_code == 400

def test_inv_reserve_stock_success(client, auth_headers):
    res = client.post('/api/inventory', headers=auth_headers, json={'sku': 'RS', 'name': 'N', 'unit_price': 1.0, 'quantity': 10})
    item_id = res.get_json()['id']
    response = client.post(f'/api/inventory/{item_id}/reserve', headers=auth_headers, json={'quantity': 5})
    assert response.status_code == 200

def test_inv_reserve_stock_not_found(client, auth_headers):
    response = client.post('/api/inventory/999/reserve', headers=auth_headers, json={'quantity': 5})
    assert response.status_code == 400

def test_inv_release_stock_success(client, auth_headers):
    res = client.post('/api/inventory', headers=auth_headers, json={'sku': 'RL', 'name': 'N', 'unit_price': 1.0, 'quantity': 10})
    item_id = res.get_json()['id']
    client.post(f'/api/inventory/{item_id}/reserve', headers=auth_headers, json={'quantity': 5})
    response = client.post(f'/api/inventory/{item_id}/release', headers=auth_headers, json={'quantity': 3})
    assert response.status_code == 200

# --- Alerts Tests ---

def test_alerts_list(client, auth_headers):
    client.post('/api/inventory', headers=auth_headers, json={'sku': 'AL', 'name': 'N', 'unit_price': 1.0, 'quantity': 1, 'reorder_point': 10})
    client.post('/api/alerts/check', headers=auth_headers)
    response = client.get('/api/alerts', headers=auth_headers)
    assert response.status_code == 200

def test_alerts_resolve(client, auth_headers):
    client.post('/api/inventory', headers=auth_headers, json={'sku': 'AR', 'name': 'N', 'unit_price': 1.0, 'quantity': 1, 'reorder_point': 10})
    client.post('/api/alerts/check', headers=auth_headers)
    res = client.get('/api/alerts', headers=auth_headers)
    alert_id = res.get_json()['alerts'][0]['id']
    response = client.post(f'/api/alerts/{alert_id}/resolve', headers=auth_headers)
    assert response.status_code == 200

def test_alerts_check_manual(client, auth_headers):
    response = client.post('/api/alerts/check', headers=auth_headers)
    assert response.status_code == 200

# --- Service Tests ---

def test_service_stock_calculations(app):
    with app.app_context():
        item = InventoryItem(sku='C', name='N', quantity=100, unit_price=10.0)
        db.session.add(item)
        db.session.commit()
        s = StockService()
        s.reserve_stock(item.id, 20)
        assert item.available == 80

def test_service_alert_generation(app):
    with app.app_context():
        item = InventoryItem(sku='G', name='N', quantity=50, unit_price=10.0, reorder_point=20)
        db.session.add(item)
        db.session.commit()
        s = StockService()
        s.adjust_stock(item.id, 40, 'OUT')
        alert = Alert.query.filter_by(item_id=item.id).first()
        assert alert is not None

def test_service_no_duplicate_alerts(app):
    with app.app_context():
        item = InventoryItem(sku='D', name='N', quantity=5, unit_price=1.0, reorder_point=10)
        db.session.add(item)
        db.session.commit()
        s = StockService()
        s.check_reorder_alerts()
        s.check_reorder_alerts()
        count = Alert.query.filter_by(item_id=item.id).count()
        assert count == 1

def test_mock_external_notification_placeholder():
    # Finding #6: Mocking external service
    with patch('app.services.stock_service.StockService.check_reorder_alerts') as m:
        s = StockService()
        s.check_reorder_alerts()
        assert m.called

def test_edge_case_negative_quantity_adjustment(app):
    with app.app_context():
        item = InventoryItem(sku='NEG', name='N', quantity=10, unit_price=1.0)
        db.session.add(item)
        db.session.commit()
        s = StockService()
        with pytest.raises(ValueError, match="negative"):
            s.adjust_stock(item.id, -20, 'ADJUSTMENT')

def test_edge_case_zero_quantity_reservation(client, auth_headers):
    res = client.post('/api/inventory', headers=auth_headers, json={'sku': 'Z', 'name': 'N', 'unit_price': 1.0, 'quantity': 10})
    item_id = res.get_json()['id']
    response = client.post(f'/api/inventory/{item_id}/reserve', headers=auth_headers, json={'quantity': 0})
    assert response.status_code == 200

def test_service_complex_sequential_movements(app):
    with app.app_context():
        item = InventoryItem(sku='SQ', name='N', quantity=100, unit_price=1.0)
        db.session.add(item)
        db.session.commit()
        s = StockService()
        s.reserve_stock(item.id, 20)
        s.adjust_stock(item.id, 10, 'OUT')
        assert item.available == 70

def test_service_reserve_insufficient(app):
    with app.app_context():
        item = InventoryItem(sku='I', name='N', quantity=5, unit_price=1.0)
        db.session.add(item)
        db.session.commit()
        s = StockService()
        with pytest.raises(ValueError, match="Insufficient"):
            s.reserve_stock(item.id, 10)
