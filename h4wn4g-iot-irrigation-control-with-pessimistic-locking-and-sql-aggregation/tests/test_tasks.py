"""
Tests for Celery tasks.
"""
import pytest
from unittest.mock import patch, MagicMock
from datetime import timedelta
from django.utils import timezone
from sensors.models import Pump, PumpActivationLog
from sensors.tasks import activate_pump_task, stop_pump_task, HardwareGateway


@pytest.mark.django_db
class TestHardwareGateway:
    """Tests for hardware gateway."""
    
    def test_activate_pump(self):
        """Test pump activation via gateway."""
        gateway = HardwareGateway()
        result = gateway.activate_pump('TEST-PUMP', 5)
        
        assert result['success'] is True
        assert result['hardware_id'] == 'TEST-PUMP'
    
    def test_deactivate_pump(self):
        """Test pump deactivation via gateway."""
        gateway = HardwareGateway()
        result = gateway.deactivate_pump('TEST-PUMP')
        
        assert result['success'] is True


@pytest.mark.django_db
class TestActivatePumpTask:
    """Tests for pump activation Celery task."""
    
    @patch.object(HardwareGateway, 'activate_pump')
    def test_activate_pump_task_success(self, mock_activate, pump):
        """Test successful pump activation task."""
        mock_activate.return_value = {'success': True, 'hardware_id': pump.hardware_id}
        
        pump.status = Pump.Status.IDLE
        pump.save()
        
        result = activate_pump_task(pump.id, duration_seconds=10)
        
        assert result['success'] is True
        
        pump.refresh_from_db()
        assert pump.status == Pump.Status.IDLE
        assert pump.total_activations == 1
        
        log = PumpActivationLog.objects.filter(pump=pump).first()
        assert log is not None
        assert log.was_successful is True
    
    def test_activate_pump_task_already_running(self, pump):
        """Test task returns failure when pump is already running."""
        # Set pump as running with an old activation time (more than 2 seconds ago)
        pump.status = Pump.Status.RUNNING
        pump.last_activation_time = timezone.now() - timedelta(seconds=10)
        pump.save()
        
        result = activate_pump_task(pump.id)
        
        assert result['success'] is False
        assert result['reason'] == 'pump_already_running'
    
    def test_activate_pump_task_not_found(self, db):
        """Test task handles missing pump gracefully."""
        result = activate_pump_task(99999)
        
        assert result['success'] is False
        assert result['reason'] == 'pump_not_found'
    
    @patch.object(HardwareGateway, 'activate_pump')
    def test_activation_creates_log(self, mock_activate, pump, low_moisture_reading):
        """Test that activation creates an audit log."""
        mock_activate.return_value = {'success': True}
        
        pump.status = Pump.Status.IDLE
        pump.save()
        
        result = activate_pump_task(
            pump.id,
            triggering_reading_id=low_moisture_reading.id
        )
        
        assert result['success'] is True
        
        log = PumpActivationLog.objects.filter(pump=pump).first()
        assert log is not None
        assert log.triggered_by_reading == low_moisture_reading


@pytest.mark.django_db
class TestStopPumpTask:
    """Tests for pump stop task."""
    
    @patch.object(HardwareGateway, 'deactivate_pump')
    def test_stop_pump_task(self, mock_deactivate, pump):
        """Test stopping a running pump."""
        mock_deactivate.return_value = {'success': True}
        
        pump.status = Pump.Status.RUNNING
        pump.save()
        
        result = stop_pump_task(pump.id)
        
        assert result['success'] is True
        
        pump.refresh_from_db()
        assert pump.status == Pump.Status.IDLE
    
    def test_stop_pump_not_running(self, pump):
        """Test stopping a pump that isn't running."""
        pump.status = Pump.Status.IDLE
        pump.save()
        
        result = stop_pump_task(pump.id)
        
        assert result['success'] is True
        assert result['reason'] == 'pump_not_running'