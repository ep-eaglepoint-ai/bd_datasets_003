"""Admin configuration for sensors app."""
from django.contrib import admin
from .models import Zone, Pump, Sensor, SensorReading, PumpActivationLog


@admin.register(Zone)
class ZoneAdmin(admin.ModelAdmin):
    list_display = ('name', 'is_active', 'created_at')
    search_fields = ('name',)


@admin.register(Pump)
class PumpAdmin(admin.ModelAdmin):
    list_display = ('hardware_id', 'zone', 'status', 'last_activation_time', 'total_activations')
    list_filter = ('status',)
    search_fields = ('hardware_id', 'zone__name')


@admin.register(Sensor)
class SensorAdmin(admin.ModelAdmin):
    list_display = ('hardware_id', 'zone', 'is_active', 'created_at')
    list_filter = ('is_active', 'zone')
    search_fields = ('hardware_id',)


@admin.register(SensorReading)
class SensorReadingAdmin(admin.ModelAdmin):
    list_display = ('sensor', 'zone', 'moisture_percentage', 'timestamp')
    list_filter = ('zone', 'is_valid')
    date_hierarchy = 'timestamp'


@admin.register(PumpActivationLog)
class PumpActivationLogAdmin(admin.ModelAdmin):
    list_display = ('pump', 'started_at', 'ended_at', 'duration_seconds', 'was_successful')
    list_filter = ('was_successful', 'pump')
    date_hierarchy = 'started_at'