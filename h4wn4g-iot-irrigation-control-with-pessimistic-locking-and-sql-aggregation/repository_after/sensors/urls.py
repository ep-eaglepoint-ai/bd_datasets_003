"""URL configuration for sensors app."""
from django.urls import path
from .views import (
    SensorDataIngestionView,
    ZoneHourlyAverageView,
    PumpStatusView,
    ManualPumpActivationView,
    HealthCheckView,
)

urlpatterns = [
    path('health/', HealthCheckView.as_view(), name='health-check'),
    path('sensors/ingest/', SensorDataIngestionView.as_view(), name='sensor-ingest'),
    path('zones/<int:zone_id>/hourly-average/', ZoneHourlyAverageView.as_view(), name='zone-hourly-average'),
    path('pumps/<int:pump_id>/status/', PumpStatusView.as_view(), name='pump-status'),
    path('pumps/<int:pump_id>/activate/', ManualPumpActivationView.as_view(), name='pump-activate'),
]