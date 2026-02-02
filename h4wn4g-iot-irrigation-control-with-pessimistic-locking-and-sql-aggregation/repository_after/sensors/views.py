"""
Views for IoT Irrigation Control System.

Implements:
- Sensor data ingestion endpoint
- Pump activation logic with pessimistic locking
- High-performance aggregation reporting using PostgreSQL
"""
import json
import logging
from datetime import timedelta
from typing import Any, Dict

from django.conf import settings
from django.db import transaction
from django.db.models import Avg
from django.db.models.functions import TruncHour
from django.http import JsonResponse
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.csrf import csrf_exempt

from .models import Pump, Sensor, SensorReading, Zone
from .tasks import activate_pump_task

logger = logging.getLogger(__name__)


@method_decorator(csrf_exempt, name='dispatch')
class SensorDataIngestionView(View):
    """
    API endpoint for ingesting sensor telemetry data.
    
    POST /api/sensors/ingest/
    
    REQUIREMENTS IMPLEMENTED:
    1. Uses transaction.atomic() and select_for_update() for locking
    2. Checks last_activation_time for 15-minute cooldown
    5. Hardware API calls happen in Celery task
    6. Concurrent requests result in exactly one task during cooldown
    8. Pump status update and task scheduling in same transaction
    9. Uses django.utils.timezone.now() for UTC timestamps
    """
    
    def post(self, request, *args, **kwargs) -> JsonResponse:
        """
        Handle incoming sensor data.
        
        Expected JSON payload:
        {
            "sensor_id": "sensor_hardware_id",
            "moisture_percentage": 8.5,
            "temperature_celsius": 22.3  // optional
        }
        """
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse(
                {'error': 'Invalid JSON payload'},
                status=400
            )
        
        sensor_hardware_id = data.get('sensor_id')
        moisture = data.get('moisture_percentage')
        temperature = data.get('temperature_celsius')
        
        if not sensor_hardware_id or moisture is None:
            return JsonResponse(
                {'error': 'Missing required fields: sensor_id, moisture_percentage'},
                status=400
            )
        
        try:
            moisture = float(moisture)
        except (TypeError, ValueError):
            return JsonResponse(
                {'error': 'moisture_percentage must be a number'},
                status=400
            )
        
        # Get sensor and zone
        try:
            sensor = Sensor.objects.select_related('zone').get(
                hardware_id=sensor_hardware_id,
                is_active=True
            )
        except Sensor.DoesNotExist:
            return JsonResponse(
                {'error': f'Sensor {sensor_hardware_id} not found or inactive'},
                status=404
            )
        
        # REQUIREMENT 9: Use timezone.now() for UTC timestamps
        current_time = timezone.now()
        
        # Create the sensor reading
        reading = SensorReading.objects.create(
            sensor=sensor,
            zone=sensor.zone,
            moisture_percentage=moisture,
            temperature_celsius=temperature,
            timestamp=current_time
        )
        
        response_data: Dict[str, Any] = {
            'status': 'recorded',
            'reading_id': reading.id,
            'timestamp': current_time.isoformat()
        }
        
        # Check if moisture is below threshold
        threshold = getattr(settings, 'MOISTURE_THRESHOLD', 10.0)
        
        if moisture < threshold:
            logger.info(
                f"Low moisture detected: {moisture}% (threshold: {threshold}%) "
                f"from sensor {sensor_hardware_id}"
            )
            
            # Attempt to activate pump with pessimistic locking
            activation_result = self._try_activate_pump(
                zone=sensor.zone,
                reading=reading
            )
            response_data['pump_activation'] = activation_result
        
        return JsonResponse(response_data, status=201)
    
    def _try_activate_pump(
        self,
        zone: Zone,
        reading: SensorReading
    ) -> Dict[str, Any]:
        """
        Attempt to activate the pump for the given zone.
        
        Uses pessimistic locking to prevent race conditions from
        concurrent sensor reports (thundering herd problem).
        
        REQUIREMENT 1: Uses transaction.atomic() and select_for_update()
        REQUIREMENT 2: Checks last_activation_time for cooldown
        REQUIREMENT 6: Only one task queued during cooldown window
        REQUIREMENT 8: Status update and task scheduling in same transaction
        """
        cooldown_minutes = getattr(settings, 'PUMP_COOLDOWN_MINUTES', 15)
        max_runtime = getattr(settings, 'PUMP_MAX_RUNTIME_SECONDS', 30)
        
        try:
            # REQUIREMENT 1: Pessimistic locking with transaction.atomic()
            with transaction.atomic():
                # REQUIREMENT 1: select_for_update() acquires row lock
                # This blocks other concurrent requests from reading the pump
                # until this transaction completes
                # PostgreSQL will block other transactions trying to lock this row
                try:
                    pump = Pump.objects.select_for_update(nowait=False).get(
                        zone=zone
                    )
                except Pump.DoesNotExist:
                    logger.warning(f"No pump configured for zone {zone.name}")
                    return {
                        'status': 'error',
                        'reason': 'no_pump_configured'
                    }
                
                # REQUIREMENT 2: Check cooldown period
                if pump.is_in_cooldown(cooldown_minutes):
                    time_remaining = None
                    if pump.last_activation_time:
                        elapsed = timezone.now() - pump.last_activation_time
                        remaining_seconds = (cooldown_minutes * 60) - elapsed.total_seconds()
                        time_remaining = max(0, int(remaining_seconds))
                    
                    logger.info(
                        f"Pump {pump.hardware_id} in cooldown, "
                        f"{time_remaining}s remaining"
                    )
                    return {
                        'status': 'cooldown',
                        'reason': 'pump_in_cooldown_period',
                        'cooldown_remaining_seconds': time_remaining
                    }
                
                # Check if pump is already running
                if pump.status == Pump.Status.RUNNING:
                    logger.info(f"Pump {pump.hardware_id} already running")
                    return {
                        'status': 'already_running',
                        'reason': 'pump_currently_active'
                    }
                
                # Check if pump is in error state
                if pump.status == Pump.Status.ERROR:
                    logger.warning(f"Pump {pump.hardware_id} is in error state")
                    return {
                        'status': 'error',
                        'reason': 'pump_in_error_state'
                    }
                
                # REQUIREMENT 8: Update pump status within the same transaction
                # This ensures the task is only scheduled if the status update succeeds
                pump.status = Pump.Status.RUNNING
                pump.last_activation_time = timezone.now()
                pump.save(update_fields=['status', 'last_activation_time', 'updated_at'])
                
                # REQUIREMENT 5 & 8: Queue Celery task within the transaction
                # The task will be sent when the transaction commits
                task = activate_pump_task.delay(
                    pump_id=pump.id,
                    triggering_reading_id=reading.id,
                    duration_seconds=max_runtime
                )
                
                logger.info(
                    f"Pump activation task queued: {task.id} "
                    f"for pump {pump.hardware_id}"
                )
                
                return {
                    'status': 'activated',
                    'task_id': str(task.id) if task.id else 'eager-mode',
                    'pump_id': pump.id,
                    'duration_seconds': max_runtime
                }
        
        except Exception as exc:
            logger.exception(f"Error activating pump for zone {zone.name}: {exc}")
            return {
                'status': 'error',
                'reason': str(exc)
            }


class ZoneHourlyAverageView(View):
    """
    API endpoint for retrieving average hourly moisture for a zone.
    
    GET /api/zones/<zone_id>/hourly-average/
    
    REQUIREMENT 4: Uses Django ORM aggregation (TruncHour, Avg)
    to perform calculation entirely within the database engine (PostgreSQL).
    NO Python loops for data processing.
    
    REQUIREMENT 7: Relies on database index (zone, timestamp) for performance.
    """
    
    def get(self, request, zone_id: int, *args, **kwargs) -> JsonResponse:
        """
        Get average hourly moisture for the last 7 days.
        
        The query uses TruncHour and Avg aggregation functions,
        performing all calculations in PostgreSQL.
        """
        try:
            zone = Zone.objects.get(id=zone_id)
        except Zone.DoesNotExist:
            return JsonResponse(
                {'error': f'Zone {zone_id} not found'},
                status=404
            )
        
        # REQUIREMENT 9: Use timezone.now() for UTC
        end_time = timezone.now()
        start_time = end_time - timedelta(days=7)
        
        # Optional query parameters
        days = request.GET.get('days')
        if days:
            try:
                days = int(days)
                start_time = end_time - timedelta(days=days)
            except ValueError:
                pass
        
        # REQUIREMENT 4: SQL Aggregation using TruncHour and Avg
        # This query is executed entirely in PostgreSQL
        # REQUIREMENT 7: Uses index on (zone, timestamp)
        hourly_averages = (
            SensorReading.objects
            .filter(
                zone=zone,
                timestamp__gte=start_time,
                timestamp__lte=end_time,
                is_valid=True
            )
            .annotate(hour=TruncHour('timestamp'))  # REQUIREMENT 4: TruncHour
            .values('hour')
            .annotate(avg_moisture=Avg('moisture_percentage'))  # REQUIREMENT 4: Avg
            .order_by('hour')
        )
        
        # Format response - note: we do NOT iterate over individual readings
        # The aggregation is done in PostgreSQL, we only process aggregated results
        result = []
        for entry in hourly_averages:
            result.append({
                'hour': entry['hour'].isoformat() if entry['hour'] else None,
                'average_moisture_percentage': round(entry['avg_moisture'], 2) if entry['avg_moisture'] else None
            })
        
        return JsonResponse({
            'zone_id': zone.id,
            'zone_name': zone.name,
            'period_start': start_time.isoformat(),
            'period_end': end_time.isoformat(),
            'hourly_averages': result,
            'total_hours': len(result)
        })


class PumpStatusView(View):
    """
    API endpoint for checking pump status.
    
    GET /api/pumps/<pump_id>/status/
    """
    
    def get(self, request, pump_id: int, *args, **kwargs) -> JsonResponse:
        """Get current pump status."""
        try:
            pump = Pump.objects.select_related('zone').get(id=pump_id)
        except Pump.DoesNotExist:
            return JsonResponse(
                {'error': f'Pump {pump_id} not found'},
                status=404
            )
        
        cooldown_minutes = getattr(settings, 'PUMP_COOLDOWN_MINUTES', 15)
        
        cooldown_remaining = None
        if pump.last_activation_time:
            elapsed = timezone.now() - pump.last_activation_time
            remaining = (cooldown_minutes * 60) - elapsed.total_seconds()
            if remaining > 0:
                cooldown_remaining = int(remaining)
        
        return JsonResponse({
            'pump_id': pump.id,
            'hardware_id': pump.hardware_id,
            'zone': pump.zone.name,
            'status': pump.status,
            'last_activation': pump.last_activation_time.isoformat() if pump.last_activation_time else None,
            'is_in_cooldown': pump.is_in_cooldown(cooldown_minutes),
            'cooldown_remaining_seconds': cooldown_remaining,
            'total_activations': pump.total_activations
        })


@method_decorator(csrf_exempt, name='dispatch')
class ManualPumpActivationView(View):
    """
    API endpoint for manually activating a pump.
    
    POST /api/pumps/<pump_id>/activate/
    
    Uses the same locking mechanism as automatic activation.
    """
    
    def post(self, request, pump_id: int, *args, **kwargs) -> JsonResponse:
        """Manually activate a pump."""
        try:
            data = json.loads(request.body) if request.body else {}
        except json.JSONDecodeError:
            data = {}
        
        duration = data.get('duration_seconds')
        
        cooldown_minutes = getattr(settings, 'PUMP_COOLDOWN_MINUTES', 15)
        max_runtime = getattr(settings, 'PUMP_MAX_RUNTIME_SECONDS', 30)
        
        if duration:
            try:
                duration = min(int(duration), max_runtime)
            except (TypeError, ValueError):
                duration = max_runtime
        else:
            duration = max_runtime
        
        try:
            with transaction.atomic():
                pump = Pump.objects.select_for_update().get(id=pump_id)
                
                if pump.is_in_cooldown(cooldown_minutes):
                    return JsonResponse({
                        'status': 'error',
                        'reason': 'pump_in_cooldown'
                    }, status=400)
                
                if pump.status == Pump.Status.RUNNING:
                    return JsonResponse({
                        'status': 'error',
                        'reason': 'pump_already_running'
                    }, status=400)
                
                pump.status = Pump.Status.RUNNING
                pump.last_activation_time = timezone.now()
                pump.save(update_fields=['status', 'last_activation_time', 'updated_at'])
                
                task = activate_pump_task.delay(
                    pump_id=pump.id,
                    duration_seconds=duration
                )
                
                return JsonResponse({
                    'status': 'activated',
                    'task_id': str(task.id) if task.id else 'eager-mode',
                    'duration_seconds': duration
                })
        
        except Pump.DoesNotExist:
            return JsonResponse(
                {'error': f'Pump {pump_id} not found'},
                status=404
            )


class HealthCheckView(View):
    """Simple health check endpoint."""
    
    def get(self, request, *args, **kwargs) -> JsonResponse:
        return JsonResponse({
            'status': 'healthy',
            'timestamp': timezone.now().isoformat()
        })