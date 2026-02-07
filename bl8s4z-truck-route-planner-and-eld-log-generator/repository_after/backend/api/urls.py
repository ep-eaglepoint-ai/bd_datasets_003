"""
URL configuration for the API.
"""
from django.urls import path
from .views import TripPlannerView, HealthCheckView, TripValidateView

urlpatterns = [
    path('health/', HealthCheckView.as_view(), name='health-check'),
    path('trip/plan/', TripPlannerView.as_view(), name='trip-plan'),
    path('trip/validate/', TripValidateView.as_view(), name='trip-validate'),
]
