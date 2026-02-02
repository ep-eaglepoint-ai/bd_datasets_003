"""
Models for IoT Irrigation Control System.

This module defines the database models for sensors, pumps, zones, and readings.
Implements proper indexing for high-performance SQL aggregation queries.
Uses PostgreSQL as the database backend.
"""
from django.db import models
from django.utils import timezone


class Zone(models.Model):
    """
    Represents a physical irrigation zone in the urban farm.
    Each zone contains multiple sensors and one pump.
    """
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'zones'
        ordering = ['name']

    def __str__(self):
        return self.name


class Pump(models.Model):
    """
    Represents a water pump associated with a zone.
    
    Implements hardware safety constraints:
    - Maximum runtime: 30 seconds
    - Cooldown period: 15 minutes between activations
    """
    class Status(models.TextChoices):
        IDLE = 'IDLE', 'Idle'
        RUNNING = 'RUNNING', 'Running'
        COOLDOWN = 'COOLDOWN', 'Cooldown'
        ERROR = 'ERROR', 'Error'

    zone = models.OneToOneField(
        Zone,
        on_delete=models.CASCADE,
        related_name='pump'
    )
    hardware_id = models.CharField(max_length=100, unique=True)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.IDLE
    )
    last_activation_time = models.DateTimeField(null=True, blank=True)
    last_deactivation_time = models.DateTimeField(null=True, blank=True)
    total_activations = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'pumps'
        ordering = ['zone__name']

    def __str__(self):
        return f"Pump {self.hardware_id} ({self.zone.name})"

    def is_in_cooldown(self, cooldown_minutes: int = 15) -> bool:
        """
        Check if the pump is currently in cooldown period.
        
        Args:
            cooldown_minutes: Minimum time between activations in minutes.
            
        Returns:
            True if pump is in cooldown, False otherwise.
        """
        if self.last_activation_time is None:
            return False
        
        time_since_activation = timezone.now() - self.last_activation_time
        cooldown_seconds = cooldown_minutes * 60
        return time_since_activation.total_seconds() < cooldown_seconds

    def can_activate(self, cooldown_minutes: int = 15) -> bool:
        """
        Determine if the pump can be activated.
        
        Args:
            cooldown_minutes: Minimum time between activations in minutes.
            
        Returns:
            True if pump can be activated, False otherwise.
        """
        if self.status == self.Status.RUNNING:
            return False
        if self.status == self.Status.ERROR:
            return False
        return not self.is_in_cooldown(cooldown_minutes)


class Sensor(models.Model):
    """
    Represents an IoT moisture sensor in a zone.
    """
    zone = models.ForeignKey(
        Zone,
        on_delete=models.CASCADE,
        related_name='sensors'
    )
    hardware_id = models.CharField(max_length=100, unique=True)
    location_description = models.CharField(max_length=255, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'sensors'
        ordering = ['zone__name', 'hardware_id']

    def __str__(self):
        return f"Sensor {self.hardware_id} ({self.zone.name})"


class SensorReading(models.Model):
    """
    Represents a moisture reading from an IoT sensor.
    
    IMPORTANT: This table can contain millions of rows. 
    Proper indexing on (zone, timestamp) is critical for aggregation queries.
    Uses PostgreSQL-specific index features.
    """
    sensor = models.ForeignKey(
        Sensor,
        on_delete=models.CASCADE,
        related_name='readings'
    )
    zone = models.ForeignKey(
        Zone,
        on_delete=models.CASCADE,
        related_name='readings'
    )
    moisture_percentage = models.FloatField()
    temperature_celsius = models.FloatField(null=True, blank=True)
    timestamp = models.DateTimeField(default=timezone.now)
    is_valid = models.BooleanField(default=True)

    class Meta:
        db_table = 'sensor_readings'
        ordering = ['-timestamp']
        # REQUIREMENT 7: Database indexes for performant aggregation queries
        indexes = [
            models.Index(fields=['zone', 'timestamp'], name='idx_zone_timestamp'),
            models.Index(fields=['timestamp'], name='idx_timestamp'),
            models.Index(fields=['zone', '-timestamp'], name='idx_zone_timestamp_desc'),
            models.Index(fields=['sensor', 'timestamp'], name='idx_sensor_timestamp'),
        ]

    def __str__(self):
        return f"Reading {self.moisture_percentage}% at {self.timestamp}"


class PumpActivationLog(models.Model):
    """
    Audit log for pump activations.
    Tracks each activation with start/end times and triggering data.
    """
    pump = models.ForeignKey(
        Pump,
        on_delete=models.CASCADE,
        related_name='activation_logs'
    )
    triggered_by_reading = models.ForeignKey(
        SensorReading,
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )
    started_at = models.DateTimeField()
    ended_at = models.DateTimeField(null=True, blank=True)
    duration_seconds = models.FloatField(null=True, blank=True)
    was_successful = models.BooleanField(default=True)
    error_message = models.TextField(blank=True)
    celery_task_id = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = 'pump_activation_logs'
        ordering = ['-started_at']

    def __str__(self):
        return f"Activation of {self.pump} at {self.started_at}"