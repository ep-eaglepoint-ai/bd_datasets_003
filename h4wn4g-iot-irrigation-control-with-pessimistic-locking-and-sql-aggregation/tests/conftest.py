"""
Pytest configuration and fixtures for irrigation control tests.
"""
import os
import sys

# Add repository_after to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'repository_after'))

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'irrigation_control.settings')
os.environ['CELERY_TASK_ALWAYS_EAGER'] = 'true'

import django
django.setup()

import pytest
from django.utils import timezone
from datetime import timedelta


@pytest.fixture
def zone(db):
    """Create a test zone."""
    from sensors.models import Zone
    return Zone.objects.create(
        name='Test Zone A',
        description='Test zone for unit tests'
    )


@pytest.fixture
def pump(db, zone):
    """Create a test pump."""
    from sensors.models import Pump
    return Pump.objects.create(
        zone=zone,
        hardware_id='PUMP-TEST-001',
        status=Pump.Status.IDLE
    )


@pytest.fixture
def sensor(db, zone):
    """Create a test sensor."""
    from sensors.models import Sensor
    return Sensor.objects.create(
        zone=zone,
        hardware_id='SENSOR-TEST-001',
        location_description='Test location'
    )


@pytest.fixture
def low_moisture_reading(db, sensor, zone):
    """Create a low moisture reading that should trigger pump."""
    from sensors.models import SensorReading
    return SensorReading.objects.create(
        sensor=sensor,
        zone=zone,
        moisture_percentage=5.0,
        timestamp=timezone.now()
    )


@pytest.fixture
def sensor_readings_bulk(db, sensor, zone):
    """Create bulk sensor readings for aggregation tests."""
    from sensors.models import SensorReading
    readings = []
    base_time = timezone.now() - timedelta(days=3)
    
    for hour in range(72):
        for reading_num in range(10):
            readings.append(SensorReading(
                sensor=sensor,
                zone=zone,
                moisture_percentage=20 + (hour % 24) + reading_num * 0.1,
                timestamp=base_time + timedelta(hours=hour, minutes=reading_num * 6)
            ))
    
    SensorReading.objects.bulk_create(readings)
    return readings


@pytest.fixture
def client():
    """Django test client."""
    from django.test import Client
    return Client()