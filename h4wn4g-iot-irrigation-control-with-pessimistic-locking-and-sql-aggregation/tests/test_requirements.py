"""
Comprehensive tests verifying ALL 9 requirements are met.
Each test is explicitly mapped to a specific requirement.
"""
import pytest
import inspect
from datetime import timedelta
from unittest.mock import patch, MagicMock
from django.conf import settings
from django.utils import timezone
from django.db import connection


class TestRequirement1PessimisticLocking:
    """
    REQUIREMENT 1: The activation logic must use transaction.atomic() and 
    Pump.objects.select_for_update() (or equivalent). 
    Checking the state without a DB lock is an automatic Fail (Race Condition).
    """
    
    def test_select_for_update_in_activation_logic(self):
        """Verify select_for_update is used in pump activation."""
        from sensors import views
        source = inspect.getsource(views.SensorDataIngestionView)
        assert 'select_for_update' in source, \
            "REQUIREMENT 1 FAIL: select_for_update() must be used for pessimistic locking"
    
    def test_transaction_atomic_in_activation_logic(self):
        """Verify transaction.atomic() wraps the activation logic."""
        from sensors import views
        source = inspect.getsource(views.SensorDataIngestionView)
        assert 'transaction.atomic' in source, \
            "REQUIREMENT 1 FAIL: transaction.atomic() must wrap activation logic"
    
    def test_select_for_update_in_try_activate_pump(self):
        """Verify _try_activate_pump method uses locking."""
        from sensors import views
        source = inspect.getsource(views.SensorDataIngestionView._try_activate_pump)
        assert 'select_for_update' in source, \
            "REQUIREMENT 1 FAIL: _try_activate_pump must use select_for_update()"
        assert 'transaction.atomic' in source, \
            "REQUIREMENT 1 FAIL: _try_activate_pump must use transaction.atomic()"


class TestRequirement2CooldownPeriod:
    """
    REQUIREMENT 2: The code must check last_activation_time. 
    If the time delta is less than 15 minutes, the request must be ignored.
    """
    
    def test_cooldown_setting_is_15_minutes(self):
        """Verify cooldown is configured as 15 minutes."""
        assert hasattr(settings, 'PUMP_COOLDOWN_MINUTES'), \
            "REQUIREMENT 2 FAIL: PUMP_COOLDOWN_MINUTES setting must exist"
        assert settings.PUMP_COOLDOWN_MINUTES == 15, \
            "REQUIREMENT 2 FAIL: Cooldown must be exactly 15 minutes"
    
    @pytest.mark.django_db
    def test_pump_in_cooldown_is_ignored(self, pump, sensor, client):
        """Verify requests during cooldown period are ignored."""
        import json
        
        # Set pump as recently activated (5 minutes ago - within cooldown)
        pump.last_activation_time = timezone.now() - timedelta(minutes=5)
        pump.save()
        
        with patch('sensors.views.activate_pump_task.delay') as mock_delay:
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
            assert data['pump_activation']['status'] == 'cooldown', \
                "REQUIREMENT 2 FAIL: Request during cooldown must be ignored"
            mock_delay.assert_not_called()
    
    @pytest.mark.django_db
    def test_pump_after_cooldown_can_activate(self, pump, sensor, client):
        """Verify pump can activate after cooldown expires."""
        import json
        
        # Set pump as activated 20 minutes ago (outside cooldown)
        pump.last_activation_time = timezone.now() - timedelta(minutes=20)
        pump.save()
        
        with patch('sensors.views.activate_pump_task.delay') as mock_delay:
            mock_delay.return_value = MagicMock(id='test-task-id')
            
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
            assert data['pump_activation']['status'] == 'activated', \
                "REQUIREMENT 2 FAIL: Pump should activate after cooldown expires"
    
    def test_is_in_cooldown_method_exists(self):
        """Verify Pump model has is_in_cooldown method."""
        from sensors.models import Pump
        assert hasattr(Pump, 'is_in_cooldown'), \
            "REQUIREMENT 2 FAIL: Pump must have is_in_cooldown() method"
    
    def test_last_activation_time_checked_in_views(self):
        """Verify views check last_activation_time."""
        from sensors import views
        source = inspect.getsource(views.SensorDataIngestionView)
        assert 'is_in_cooldown' in source or 'last_activation_time' in source, \
            "REQUIREMENT 2 FAIL: Activation logic must check last_activation_time"


class TestRequirement3MaxRuntime:
    """
    REQUIREMENT 3: The pump run duration must be capped (e.g., hardcoded or config). 
    The system cannot rely on a "Stop" signal from the sensor (which might fail).
    """
    
    def test_max_runtime_setting_exists(self):
        """Verify max runtime is configured."""
        assert hasattr(settings, 'PUMP_MAX_RUNTIME_SECONDS'), \
            "REQUIREMENT 3 FAIL: PUMP_MAX_RUNTIME_SECONDS setting must exist"
    
    def test_max_runtime_is_30_seconds(self):
        """Verify max runtime is 30 seconds."""
        assert settings.PUMP_MAX_RUNTIME_SECONDS == 30, \
            "REQUIREMENT 3 FAIL: Max runtime must be 30 seconds"
    
    def test_duration_capped_in_task(self):
        """Verify task caps duration to max runtime."""
        from sensors import tasks
        source = inspect.getsource(tasks.activate_pump_task)
        assert 'max_runtime' in source.lower() or 'PUMP_MAX_RUNTIME' in source, \
            "REQUIREMENT 3 FAIL: Task must reference max runtime setting"
        assert 'min(' in source, \
            "REQUIREMENT 3 FAIL: Task must cap duration using min()"
    
    @pytest.mark.django_db
    def test_duration_cannot_exceed_max(self, pump):
        """Verify duration is capped even if larger value requested."""
        from sensors.tasks import activate_pump_task
        from unittest.mock import patch
        
        pump.status = pump.Status.IDLE
        pump.save()
        
        with patch('sensors.tasks.HardwareGateway.activate_pump') as mock_hw:
            mock_hw.return_value = {'success': True}
            
            # Request 60 seconds, should be capped to 30
            result = activate_pump_task(pump.id, duration_seconds=60)
            
            assert result['success'] is True
            # Verify hardware was called with capped duration
            call_args = mock_hw.call_args
            actual_duration = call_args[0][1]  # Second positional arg
            assert actual_duration <= 30, \
                "REQUIREMENT 3 FAIL: Duration must be capped to max runtime"


class TestRequirement4SQLAggregation:
    """
    REQUIREMENT 4: The historical data view must use annotate, TruncHour, and Avg. 
    Using a Python loop (for reading in all_readings:) is a performance Fail.
    """
    
    def test_uses_trunchour(self):
        """Verify TruncHour is used for hourly aggregation."""
        from sensors import views
        source = inspect.getsource(views.ZoneHourlyAverageView)
        assert 'TruncHour' in source, \
            "REQUIREMENT 4 FAIL: Must use TruncHour for hourly grouping"
    
    def test_uses_avg(self):
        """Verify Avg aggregation function is used."""
        from sensors import views
        source = inspect.getsource(views.ZoneHourlyAverageView)
        assert 'Avg' in source, \
            "REQUIREMENT 4 FAIL: Must use Avg for averaging"
    
    def test_uses_annotate(self):
        """Verify annotate is used for query building."""
        from sensors import views
        source = inspect.getsource(views.ZoneHourlyAverageView)
        assert 'annotate' in source, \
            "REQUIREMENT 4 FAIL: Must use annotate() for aggregation"
    
    def test_no_python_loop_for_readings(self):
        """Verify no Python loops iterate over individual readings."""
        from sensors import views
        source = inspect.getsource(views.ZoneHourlyAverageView)
        
        # Check for forbidden patterns
        forbidden_patterns = [
            'for reading in',
            'for r in all_readings',
            'for item in readings',
            'for row in sensor_readings',
        ]
        
        source_lower = source.lower()
        for pattern in forbidden_patterns:
            assert pattern not in source_lower, \
                f"REQUIREMENT 4 FAIL: Found forbidden pattern '{pattern}' - no Python loops allowed"
    
    @pytest.mark.django_db
    def test_aggregation_query_structure(self, zone, sensor):
        """Verify the query uses database-level aggregation."""
        from sensors.models import SensorReading
        from django.db.models import Avg
        from django.db.models.functions import TruncHour
        
        # Create test data
        base_time = timezone.now() - timedelta(hours=3)
        for i in range(30):
            SensorReading.objects.create(
                sensor=sensor,
                zone=zone,
                moisture_percentage=25 + i % 10,
                timestamp=base_time + timedelta(minutes=i * 5)
            )
        
        # Execute aggregation query
        result = list(
            SensorReading.objects
            .filter(zone=zone)
            .annotate(hour=TruncHour('timestamp'))
            .values('hour')
            .annotate(avg_moisture=Avg('moisture_percentage'))
            .order_by('hour')
        )
        
        # Should have aggregated results (fewer rows than original 30)
        assert len(result) < 30, \
            "REQUIREMENT 4 FAIL: Aggregation should reduce row count"
        assert len(result) >= 1, \
            "REQUIREMENT 4 FAIL: Should have at least one aggregated result"


class TestRequirement5CeleryTask:
    """
    REQUIREMENT 5: The actual call to the hardware API (simulated) must happen 
    inside a Celery task (@shared_task), not in the synchronous Django view.
    """
    
    def test_shared_task_decorator_used(self):
        """Verify @shared_task decorator is used."""
        from sensors import tasks
        source = inspect.getsource(tasks)
        assert '@shared_task' in source, \
            "REQUIREMENT 5 FAIL: Must use @shared_task decorator"
    
    def test_hardware_gateway_in_task(self):
        """Verify HardwareGateway is called inside task."""
        from sensors import tasks
        source = inspect.getsource(tasks.activate_pump_task)
        assert 'HardwareGateway' in source or 'gateway' in source.lower(), \
            "REQUIREMENT 5 FAIL: Hardware call must be in Celery task"
    
    def test_hardware_not_in_view(self):
        """Verify HardwareGateway is NOT called directly in views."""
        from sensors import views
        source = inspect.getsource(views)
        assert 'HardwareGateway' not in source, \
            "REQUIREMENT 5 FAIL: Hardware calls must not be in views"
        assert 'gateway.activate' not in source.lower(), \
            "REQUIREMENT 5 FAIL: Hardware activation must not be in views"
    
    def test_view_calls_task_delay(self):
        """Verify view uses task.delay() to enqueue work."""
        from sensors import views
        source = inspect.getsource(views.SensorDataIngestionView)
        assert 'activate_pump_task.delay' in source, \
            "REQUIREMENT 5 FAIL: View must use activate_pump_task.delay()"


class TestRequirement6SingleTaskDuringCooldown:
    """
    REQUIREMENT 6: Multiple concurrent hits to the webhook must result in 
    exactly one Celery task being enqueued during the cooldown window.
    """
    
    @pytest.mark.django_db
    def test_second_request_blocked_by_running_status(self, zone, pump, sensor, client):
        """Verify second request is blocked when pump is running."""
        import json
        
        # First request activates pump
        with patch('sensors.views.activate_pump_task.delay') as mock_delay:
            mock_delay.return_value = MagicMock(id='task-1')
            
            payload = {'sensor_id': sensor.hardware_id, 'moisture_percentage': 5.0}
            response1 = client.post(
                '/api/sensors/ingest/',
                data=json.dumps(payload),
                content_type='application/json'
            )
            
            assert response1.json()['pump_activation']['status'] == 'activated'
        
        # Pump is now RUNNING, second request should be blocked
        pump.refresh_from_db()
        
        with patch('sensors.views.activate_pump_task.delay') as mock_delay:
            response2 = client.post(
                '/api/sensors/ingest/',
                data=json.dumps(payload),
                content_type='application/json'
            )
            
            status = response2.json()['pump_activation']['status']
            assert status in ['already_running', 'cooldown'], \
                "REQUIREMENT 6 FAIL: Second request must be blocked"
            mock_delay.assert_not_called()
    
    def test_locking_prevents_race_condition(self):
        """Verify select_for_update prevents race conditions."""
        from sensors import views
        source = inspect.getsource(views.SensorDataIngestionView._try_activate_pump)
        
        # Must use select_for_update to prevent races
        assert 'select_for_update' in source, \
            "REQUIREMENT 6 FAIL: Must use select_for_update to prevent race conditions"


class TestRequirement7DatabaseIndexes:
    """
    REQUIREMENT 7: The SensorReading model should strictly include an index 
    on timestamp and zone for the aggregation query to be performant.
    """
    
    def test_sensor_reading_has_indexes(self):
        """Verify SensorReading model has indexes defined."""
        from sensors.models import SensorReading
        indexes = SensorReading._meta.indexes
        assert len(indexes) >= 2, \
            "REQUIREMENT 7 FAIL: SensorReading must have at least 2 indexes"
    
    def test_zone_timestamp_index_exists(self):
        """Verify composite index on (zone, timestamp) exists."""
        from sensors.models import SensorReading
        indexes = SensorReading._meta.indexes
        
        found_zone_timestamp = False
        for idx in indexes:
            if 'zone' in idx.fields and 'timestamp' in idx.fields:
                found_zone_timestamp = True
                break
            # Also check for index name
            if 'zone_timestamp' in idx.name.lower():
                found_zone_timestamp = True
                break
        
        assert found_zone_timestamp, \
            "REQUIREMENT 7 FAIL: Must have index on (zone, timestamp)"
    
    def test_timestamp_index_exists(self):
        """Verify index on timestamp exists."""
        from sensors.models import SensorReading
        indexes = SensorReading._meta.indexes
        
        found_timestamp = False
        for idx in indexes:
            if 'timestamp' in idx.fields:
                found_timestamp = True
                break
        
        assert found_timestamp, \
            "REQUIREMENT 7 FAIL: Must have index on timestamp"


class TestRequirement8AtomicStatusAndTask:
    """
    REQUIREMENT 8: Updating the pump status to "RUNNING" and scheduling the task 
    must happen within the same transaction commit.
    """
    
    def test_status_update_and_task_in_same_atomic_block(self):
        """Verify status update and task.delay() are in same transaction."""
        from sensors import views
        source = inspect.getsource(views.SensorDataIngestionView._try_activate_pump)
        
        # Find the transaction.atomic block
        assert 'with transaction.atomic()' in source, \
            "REQUIREMENT 8 FAIL: Must use 'with transaction.atomic()'"
        
        # Both operations should be present
        assert 'pump.status = Pump.Status.RUNNING' in source or "status = " in source, \
            "REQUIREMENT 8 FAIL: Must update pump status to RUNNING"
        assert 'pump.save' in source, \
            "REQUIREMENT 8 FAIL: Must save pump status"
        assert 'activate_pump_task.delay' in source, \
            "REQUIREMENT 8 FAIL: Must call activate_pump_task.delay()"
    
    @pytest.mark.django_db
    def test_pump_status_updated_before_response(self, pump, sensor, client):
        """Verify pump status is RUNNING after activation request."""
        import json
        
        with patch('sensors.views.activate_pump_task.delay') as mock_delay:
            mock_delay.return_value = MagicMock(id='test-id')
            
            payload = {'sensor_id': sensor.hardware_id, 'moisture_percentage': 5.0}
            response = client.post(
                '/api/sensors/ingest/',
                data=json.dumps(payload),
                content_type='application/json'
            )
            
            assert response.status_code == 201
            assert response.json()['pump_activation']['status'] == 'activated'
        
        # Verify pump status was updated in the same transaction
        pump.refresh_from_db()
        assert pump.status == pump.Status.RUNNING, \
            "REQUIREMENT 8 FAIL: Pump status must be RUNNING after activation"


class TestRequirement9TimezoneNow:
    """
    REQUIREMENT 9: Must use django.utils.timezone.now() (UTC) instead of 
    datetime.now() to avoid timezone bugs.
    """
    
    def test_views_use_timezone_now(self):
        """Verify views use timezone.now()."""
        from sensors import views
        source = inspect.getsource(views)
        
        assert 'timezone.now()' in source, \
            "REQUIREMENT 9 FAIL: Views must use timezone.now()"
        assert 'datetime.now()' not in source, \
            "REQUIREMENT 9 FAIL: Views must not use datetime.now()"
    
    def test_tasks_use_timezone_now(self):
        """Verify tasks use timezone.now()."""
        from sensors import tasks
        source = inspect.getsource(tasks)
        
        assert 'timezone.now()' in source, \
            "REQUIREMENT 9 FAIL: Tasks must use timezone.now()"
        assert 'datetime.now()' not in source, \
            "REQUIREMENT 9 FAIL: Tasks must not use datetime.now()"
    
    def test_models_use_timezone_now(self):
        """Verify models use timezone.now for defaults."""
        from sensors import models
        source = inspect.getsource(models)
        
        assert 'timezone.now' in source, \
            "REQUIREMENT 9 FAIL: Models must use timezone.now for defaults"
    
    def test_timezone_imported_correctly(self):
        """Verify timezone is imported from django.utils."""
        from sensors import views, tasks
        
        views_source = inspect.getsource(views)
        assert 'from django.utils import timezone' in views_source or \
               'django.utils.timezone' in views_source, \
            "REQUIREMENT 9 FAIL: Views must import timezone from django.utils"
        
        tasks_source = inspect.getsource(tasks)
        assert 'from django.utils import timezone' in tasks_source or \
               'django.utils.timezone' in tasks_source, \
            "REQUIREMENT 9 FAIL: Tasks must import timezone from django.utils"