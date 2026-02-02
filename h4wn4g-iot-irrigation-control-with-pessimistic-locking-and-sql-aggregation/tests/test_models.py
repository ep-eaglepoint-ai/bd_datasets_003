"""
Tests for irrigation control models.
"""
import pytest
from datetime import timedelta
from django.utils import timezone
from sensors.models import Zone, Pump, Sensor, SensorReading


@pytest.mark.django_db
class TestZoneModel:
    """Tests for the Zone model."""
    
    def test_create_zone(self):
        """Test zone creation."""
        zone = Zone.objects.create(name='Test Zone', description='A test zone')
        assert zone.id is not None
        assert zone.name == 'Test Zone'
        assert zone.is_active is True
    
    def test_zone_str(self):
        """Test zone string representation."""
        zone = Zone.objects.create(name='Alpha Zone')
        assert str(zone) == 'Alpha Zone'


@pytest.mark.django_db
class TestPumpModel:
    """Tests for the Pump model."""
    
    def test_create_pump(self, zone):
        """Test pump creation."""
        pump = Pump.objects.create(
            zone=zone,
            hardware_id='PUMP-001'
        )
        assert pump.id is not None
        assert pump.status == Pump.Status.IDLE
        assert pump.total_activations == 0
    
    def test_pump_str(self, zone):
        """Test pump string representation."""
        pump = Pump.objects.create(zone=zone, hardware_id='PUMP-001')
        assert 'PUMP-001' in str(pump)
    
    def test_is_in_cooldown_no_activation(self, pump):
        """Test cooldown check when pump never activated."""
        assert pump.is_in_cooldown() is False
    
    def test_is_in_cooldown_recent_activation(self, pump):
        """Test cooldown check with recent activation."""
        pump.last_activation_time = timezone.now() - timedelta(minutes=5)
        pump.save()
        assert pump.is_in_cooldown(cooldown_minutes=15) is True
    
    def test_is_in_cooldown_old_activation(self, pump):
        """Test cooldown check with old activation."""
        pump.last_activation_time = timezone.now() - timedelta(minutes=20)
        pump.save()
        assert pump.is_in_cooldown(cooldown_minutes=15) is False
    
    def test_can_activate_idle_pump(self, pump):
        """Test can_activate for idle pump."""
        assert pump.can_activate() is True
    
    def test_cannot_activate_running_pump(self, pump):
        """Test can_activate for running pump."""
        pump.status = Pump.Status.RUNNING
        pump.save()
        assert pump.can_activate() is False
    
    def test_cannot_activate_in_cooldown(self, pump):
        """Test can_activate during cooldown."""
        pump.last_activation_time = timezone.now() - timedelta(minutes=5)
        pump.save()
        assert pump.can_activate(cooldown_minutes=15) is False


@pytest.mark.django_db
class TestSensorReadingModel:
    """Tests for the SensorReading model."""
    
    def test_create_reading(self, sensor, zone):
        """Test sensor reading creation."""
        reading = SensorReading.objects.create(
            sensor=sensor,
            zone=zone,
            moisture_percentage=45.5,
            temperature_celsius=22.0
        )
        assert reading.id is not None
        assert reading.moisture_percentage == 45.5
    
    def test_reading_indexes_exist(self):
        """REQUIREMENT 7: Verify indexes exist on model."""
        indexes = SensorReading._meta.indexes
        index_names = [idx.name for idx in indexes]
        
        assert 'idx_zone_timestamp' in index_names
        assert 'idx_timestamp' in index_names