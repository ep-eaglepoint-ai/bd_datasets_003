"""
Celery tasks for IoT Irrigation Control System.

REQUIREMENT 5: Heavy I/O operations (hardware API calls) are offloaded 
to background Celery workers, not blocking HTTP requests.
"""
import time
import logging
from typing import Optional
from celery import shared_task
from django.conf import settings
from django.db import transaction
from django.utils import timezone

logger = logging.getLogger(__name__)


class HardwareGateway:
    """
    Simulated hardware gateway for pump control.
    In production, this would communicate with actual hardware.
    """
    
    @staticmethod
    def activate_pump(hardware_id: str, duration_seconds: int) -> dict:
        """
        Simulate activating a pump for a specified duration.
        
        Args:
            hardware_id: The pump's hardware identifier.
            duration_seconds: How long to run the pump.
            
        Returns:
            dict with activation result.
        """
        logger.info(f"[HW Gateway] Activating pump {hardware_id} for {duration_seconds}s")
        
        # Simulate hardware communication delay
        time.sleep(0.1)
        
        logger.info(f"[HW Gateway] Pump {hardware_id} completed {duration_seconds}s cycle")
        
        return {
            'success': True,
            'hardware_id': hardware_id,
            'actual_duration': duration_seconds,
            'timestamp': timezone.now().isoformat()
        }
    
    @staticmethod
    def deactivate_pump(hardware_id: str) -> dict:
        """
        Force deactivate a pump.
        
        Args:
            hardware_id: The pump's hardware identifier.
            
        Returns:
            dict with deactivation result.
        """
        logger.info(f"[HW Gateway] Deactivating pump {hardware_id}")
        time.sleep(0.05)
        
        return {
            'success': True,
            'hardware_id': hardware_id,
            'timestamp': timezone.now().isoformat()
        }


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def activate_pump_task(
    self,
    pump_id: int,
    triggering_reading_id: Optional[int] = None,
    duration_seconds: Optional[int] = None
) -> dict:
    """
    Celery task to activate a pump for irrigation.
    
    REQUIREMENT 3: Pump run duration is capped to max runtime (30s default).
    REQUIREMENT 5: Hardware API calls happen inside Celery task.
    
    Args:
        pump_id: ID of the pump to activate.
        triggering_reading_id: ID of the sensor reading that triggered this.
        duration_seconds: Optional custom duration (capped to max).
        
    Returns:
        dict with task result.
    """
    from sensors.models import Pump, PumpActivationLog, SensorReading
    
    max_runtime = getattr(settings, 'PUMP_MAX_RUNTIME_SECONDS', 30)
    
    if duration_seconds is None:
        duration_seconds = max_runtime
    else:
        # REQUIREMENT 3: Cap duration to max runtime
        duration_seconds = min(duration_seconds, max_runtime)
    
    logger.info(f"[Task] Starting pump activation task for pump_id={pump_id}")
    
    try:
        with transaction.atomic():
            # Lock the pump row to prevent concurrent modifications
            pump = Pump.objects.select_for_update().get(id=pump_id)
            
            # Check if pump is already running - if so, skip this task
            # This handles the case where the task is called directly or race condition
            if pump.status == Pump.Status.RUNNING:
                # Check if this is a new request (pump was already running before we got here)
                # vs. we set it to running in the view
                if pump.last_activation_time:
                    time_since_activation = (timezone.now() - pump.last_activation_time).total_seconds()
                    # If activated more than 2 seconds ago, it's likely already being handled
                    if time_since_activation > 2:
                        logger.warning(f"[Task] Pump {pump_id} is already running, aborting")
                        return {'success': False, 'reason': 'pump_already_running'}
            
            # Create activation log
            triggering_reading = None
            if triggering_reading_id:
                triggering_reading = SensorReading.objects.filter(
                    id=triggering_reading_id
                ).first()
            
            activation_log = PumpActivationLog.objects.create(
                pump=pump,
                triggered_by_reading=triggering_reading,
                started_at=timezone.now(),
                celery_task_id=str(self.request.id) if self.request.id else ''
            )
            
            # Update pump status to RUNNING if not already
            if pump.status != Pump.Status.RUNNING:
                pump.status = Pump.Status.RUNNING
                pump.last_activation_time = timezone.now()
                pump.save(update_fields=['status', 'last_activation_time', 'updated_at'])
        
        # REQUIREMENT 5: Hardware API call (outside transaction, can take time)
        gateway = HardwareGateway()
        result = gateway.activate_pump(pump.hardware_id, duration_seconds)
        
        # Update records after hardware operation completes
        with transaction.atomic():
            pump = Pump.objects.select_for_update().get(id=pump_id)
            end_time = timezone.now()
            
            pump.status = Pump.Status.IDLE
            pump.last_deactivation_time = end_time
            pump.total_activations += 1
            pump.save(update_fields=[
                'status', 'last_deactivation_time', 
                'total_activations', 'updated_at'
            ])
            
            activation_log.ended_at = end_time
            activation_log.duration_seconds = (
                end_time - activation_log.started_at
            ).total_seconds()
            activation_log.was_successful = result.get('success', False)
            activation_log.save()
        
        logger.info(f"[Task] Pump activation completed for pump_id={pump_id}")
        
        return {
            'success': True,
            'pump_id': pump_id,
            'duration': duration_seconds,
            'activation_log_id': activation_log.id
        }
        
    except Pump.DoesNotExist:
        logger.error(f"[Task] Pump {pump_id} not found")
        return {'success': False, 'reason': 'pump_not_found'}
    
    except Exception as exc:
        logger.exception(f"[Task] Error activating pump {pump_id}: {exc}")
        
        # Try to reset pump status on error
        try:
            with transaction.atomic():
                pump = Pump.objects.select_for_update().get(id=pump_id)
                pump.status = Pump.Status.ERROR
                pump.save(update_fields=['status', 'updated_at'])
        except Exception:
            pass
        
        raise


@shared_task(bind=True)
def stop_pump_task(self, pump_id: int) -> dict:
    """
    Force stop a running pump.
    
    Args:
        pump_id: ID of the pump to stop.
        
    Returns:
        dict with task result.
    """
    from sensors.models import Pump
    
    logger.info(f"[Task] Force stopping pump_id={pump_id}")
    
    try:
        with transaction.atomic():
            pump = Pump.objects.select_for_update().get(id=pump_id)
            
            if pump.status != Pump.Status.RUNNING:
                return {'success': True, 'reason': 'pump_not_running'}
            
            # Call hardware to stop
            gateway = HardwareGateway()
            gateway.deactivate_pump(pump.hardware_id)
            
            pump.status = Pump.Status.IDLE
            pump.last_deactivation_time = timezone.now()
            pump.save(update_fields=[
                'status', 'last_deactivation_time', 'updated_at'
            ])
        
        return {'success': True, 'pump_id': pump_id}
        
    except Pump.DoesNotExist:
        return {'success': False, 'reason': 'pump_not_found'}
    except Exception as exc:
        logger.exception(f"[Task] Error stopping pump {pump_id}: {exc}")
        return {'success': False, 'reason': str(exc)}