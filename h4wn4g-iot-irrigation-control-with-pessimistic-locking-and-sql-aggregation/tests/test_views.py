"""
Tests for irrigation control views.
"""
import json
import pytest
from datetime import timedelta
from unittest.mock import patch, MagicMock
from django.utils import timezone
from django.db import connection
from sensors.models import Pump, SensorReading


@pytest.mark.django_db
class TestSensorDataIngestionView:
    """Tests for the sensor data ingestion endpoint."""
    
    def test_ingest_valid_data(self, client, sensor):
        """Test ingesting valid sensor data."""
        payload = {
            'sensor_id': sensor.hardware_id,
            'moisture_percentage': 45.0,
            'temperature_celsius': 22.5
        }
        
        response = client.post(
            '/api/sensors/ingest/',
            data=json.dumps(payload),
            content_type='application/json'
        )
        
        assert response.status_code == 201
        data = response.json()
        assert data['status'] == 'recorded'
        assert 'reading_id' in data
    
    def test_ingest_missing_sensor_id(self, client):
        """Test ingestion fails without sensor_id."""
        payload = {'moisture_percentage': 45.0}
        
        response = client.post(
            '/api/sensors/ingest/',
            data=json.dumps(payload),
            content_type='application/json'
        )
        
        assert response.status_code == 400
    
    def test_ingest_invalid_sensor(self, client):
        """Test ingestion fails for unknown sensor."""
        payload = {
            'sensor_id': 'UNKNOWN-SENSOR',
            'moisture_percentage': 45.0
        }
        
        response = client.post(
            '/api/sensors/ingest/',
            data=json.dumps(payload),
            content_type='application/json'
        )
        
        assert response.status_code == 404


# Use transaction=True for tests that need on_commit callbacks to fire
@pytest.mark.django_db(transaction=True)
class TestSensorDataIngestionWithOnCommit:
    """Tests that require transaction.on_commit() to execute."""
    
    @patch('sensors.tasks.activate_pump_task.delay')
    def test_low_moisture_triggers_pump_activation(self, mock_delay, client):
        """Test that low moisture triggers pump activation."""
        from sensors.models import Zone, Sensor, Pump
        
        # Create test data within this transaction
        zone = Zone.objects.create(name='Test Zone OnCommit')
        pump = Pump.objects.create(zone=zone, hardware_id='PUMP-ONCOMMIT-001')
        sensor = Sensor.objects.create(zone=zone, hardware_id='SENSOR-ONCOMMIT-001')
        
        mock_delay.return_value = MagicMock(id='test-task-id')
        
        payload = {
            'sensor_id': sensor.hardware_id,
            'moisture_percentage': 5.0  # Below threshold
        }
        
        response = client.post(
            '/api/sensors/ingest/',
            data=json.dumps(payload),
            content_type='application/json'
        )
        
        assert response.status_code == 201
        data = response.json()
        assert 'pump_activation' in data
        assert data['pump_activation']['status'] == 'activated'
        
        # With transaction=True, on_commit callbacks fire
        mock_delay.assert_called_once()
    
    @patch('sensors.tasks.activate_pump_task.delay')
    def test_pump_cooldown_prevents_activation(self, mock_delay, client):
        """REQUIREMENT 2: Test cooldown period is enforced."""
        from sensors.models import Zone, Sensor, Pump
        
        zone = Zone.objects.create(name='Test Zone Cooldown')
        pump = Pump.objects.create(zone=zone, hardware_id='PUMP-COOLDOWN-001')
        sensor = Sensor.objects.create(zone=zone, hardware_id='SENSOR-COOLDOWN-001')
        
        # Set pump as recently activated
        pump.last_activation_time = timezone.now() - timedelta(minutes=5)
        pump.save()
        
        payload = {
            'sensor_id': sensor.hardware_id,
            'moisture_percentage': 5.0
        }
        
        response = client.post(
            '/api/sensors/ingest/',
            data=json.dumps(payload),
            content_type='application/json'
        )
        
        assert response.status_code == 201
        data = response.json()
        assert data['pump_activation']['status'] == 'cooldown'
        
        # Task should NOT be called
        mock_delay.assert_not_called()
    
    @patch('sensors.tasks.activate_pump_task.delay')
    def test_running_pump_prevents_activation(self, mock_delay, client):
        """Test that running pump prevents new activation."""
        from sensors.models import Zone, Sensor, Pump
        
        zone = Zone.objects.create(name='Test Zone Running')
        pump = Pump.objects.create(
            zone=zone, 
            hardware_id='PUMP-RUNNING-001',
            status=Pump.Status.RUNNING
        )
        sensor = Sensor.objects.create(zone=zone, hardware_id='SENSOR-RUNNING-001')
        
        payload = {
            'sensor_id': sensor.hardware_id,
            'moisture_percentage': 5.0
        }
        
        response = client.post(
            '/api/sensors/ingest/',
            data=json.dumps(payload),
            content_type='application/json'
        )
        
        assert response.status_code == 201
        data = response.json()
        assert data['pump_activation']['status'] == 'already_running'
        mock_delay.assert_not_called()


@pytest.mark.django_db
class TestZoneHourlyAverageView:
    """Tests for zone hourly average endpoint."""
    
    def test_get_hourly_average(self, client, zone, sensor_readings_bulk):
        """Test retrieving hourly averages."""
        response = client.get(f'/api/zones/{zone.id}/hourly-average/')
        
        assert response.status_code == 200
        data = response.json()
        
        assert data['zone_id'] == zone.id
        assert 'hourly_averages' in data
        assert len(data['hourly_averages']) > 0
    
    def test_get_hourly_average_nonexistent_zone(self, client):
        """Test 404 for nonexistent zone."""
        response = client.get('/api/zones/99999/hourly-average/')
        assert response.status_code == 404
    
    def test_hourly_average_uses_aggregation(self, client, zone, sensor):
        """REQUIREMENT 4: Verify aggregation is used."""
        from sensors.models import SensorReading
        
        base_time = timezone.now() - timedelta(hours=2)
        
        for i in range(10):
            SensorReading.objects.create(
                sensor=sensor,
                zone=zone,
                moisture_percentage=20 + i,
                timestamp=base_time + timedelta(minutes=i * 5)
            )
        
        response = client.get(f'/api/zones/{zone.id}/hourly-average/')
        
        assert response.status_code == 200
        data = response.json()
        
        assert len(data['hourly_averages']) <= 3


@pytest.mark.django_db
class TestPumpStatusView:
    """Tests for pump status endpoint."""
    
    def test_get_pump_status(self, client, pump):
        """Test retrieving pump status."""
        response = client.get(f'/api/pumps/{pump.id}/status/')
        
        assert response.status_code == 200
        data = response.json()
        
        assert data['pump_id'] == pump.id
        assert data['status'] == 'IDLE'
        assert data['hardware_id'] == pump.hardware_id
    
    def test_get_pump_status_nonexistent(self, client):
        """Test 404 for nonexistent pump."""
        response = client.get('/api/pumps/99999/status/')
        assert response.status_code == 404


@pytest.mark.django_db
class TestHealthCheck:
    """Tests for health check endpoint."""
    
    def test_health_check(self, client):
        """Test health check returns healthy."""
        response = client.get('/api/health/')
        
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'healthy'