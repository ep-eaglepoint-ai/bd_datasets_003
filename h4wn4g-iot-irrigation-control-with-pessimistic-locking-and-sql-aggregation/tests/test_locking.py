"""
Tests for pessimistic locking and race condition prevention.
"""
import pytest
from datetime import timedelta
from unittest.mock import patch, MagicMock
from django.utils import timezone
from sensors.models import Pump


@pytest.mark.django_db
class TestPessimisticLocking:
    """Tests for database-level locking."""
    
    @patch('sensors.views.activate_pump_task.delay')
    def test_sequential_requests_single_activation(
        self, mock_delay, zone, pump, sensor
    ):
        """REQUIREMENT 6: Multiple requests result in exactly one task."""
        from django.test import Client
        import json
        
        mock_delay.return_value = MagicMock(id='test-task-id')
        
        client = Client()
        payload = {
            'sensor_id': sensor.hardware_id,
            'moisture_percentage': 5.0
        }
        
        response1 = client.post(
            '/api/sensors/ingest/',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response1.status_code == 201
        data1 = response1.json()
        assert data1.get('pump_activation', {}).get('status') == 'activated'
        
        pump.refresh_from_db()
        
        response2 = client.post(
            '/api/sensors/ingest/',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response2.status_code == 201
        data2 = response2.json()
        status = data2.get('pump_activation', {}).get('status')
        assert status in ['cooldown', 'already_running']
        
        assert mock_delay.call_count == 1
    
    def test_select_for_update_used_in_code(self):
        """REQUIREMENT 1: Verify select_for_update is used."""
        import inspect
        from sensors import views
        
        source = inspect.getsource(views.SensorDataIngestionView)
        assert 'select_for_update' in source
    
    def test_transaction_atomic_used(self):
        """REQUIREMENT 1: Verify transaction.atomic() is used."""
        import inspect
        from sensors import views
        
        source = inspect.getsource(views.SensorDataIngestionView)
        assert 'transaction.atomic' in source


@pytest.mark.django_db
class TestCooldownEnforcement:
    """Tests for cooldown requirement."""
    
    def test_cooldown_15_minutes(self, pump):
        """REQUIREMENT 2: Pump cannot activate within 15 minutes."""
        pump.last_activation_time = timezone.now() - timedelta(minutes=10)
        pump.save()
        
        assert pump.is_in_cooldown(cooldown_minutes=15) is True
        assert pump.can_activate(cooldown_minutes=15) is False
    
    def test_after_cooldown_can_activate(self, pump):
        """Test pump can activate after cooldown expires."""
        pump.last_activation_time = timezone.now() - timedelta(minutes=20)
        pump.save()
        
        assert pump.is_in_cooldown(cooldown_minutes=15) is False
        assert pump.can_activate(cooldown_minutes=15) is True