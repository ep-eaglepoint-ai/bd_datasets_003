"""
API views for the Login Attempt Analyzer.

Minimal implementation per prompt requirements:
- Fetch recent login attempts
- Fetch flagged alerts

Following architectural constraints:
- API layer handles database interactions
- Detection logic remains pure and DB-agnostic
- No persistence of suspicious state (computed on-the-fly)
"""

from datetime import timedelta
from django.utils import timezone
from django.shortcuts import render
from rest_framework import generics, status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from .models import LoginAttempt
from .serializers import LoginAttemptSerializer
from .detection import BruteForceDetector


def index_view(request):
    """Serve the frontend application."""
    return render(request, 'index.html')


class LoginAttemptListAPIView(generics.ListCreateAPIView):
    """
    API endpoint to list recent login attempts.
    
    GET /api/login_attempts/
    
    Returns a list of recent login attempts (last 24 hours).
    Minimal implementation per prompt requirements.
    """
    
    serializer_class = LoginAttemptSerializer
    
    def get_queryset(self):
        """Return login attempts from the last 24 hours."""
        cutoff_time = timezone.now() - timedelta(hours=24)
        return LoginAttempt.objects.filter(
            timestamp__gte=cutoff_time
        ).order_by('-timestamp')


@api_view(['GET'])
def suspicious_activity_view(request):
    """
    API endpoint to list flagged suspicious IP addresses.
    
    GET /api/suspicious/
    
    Returns IP addresses flagged as suspicious based on brute-force patterns.
    Uses default thresholds (5 failed attempts in 10 minutes).
    Minimal implementation per prompt requirements.
    """
    
    # Define time window for data retrieval (last 24 hours)
    cutoff_time = timezone.now() - timedelta(hours=24)
    
    # Fetch recent attempts from database (API layer handles DB interaction)
    recent_attempts = list(LoginAttempt.objects.filter(
        timestamp__gte=cutoff_time
    ).order_by('-timestamp'))
    
    # Use detection service with default settings (pure logic, DB-agnostic)
    detector = BruteForceDetector()
    suspicious_ips = detector.detect_suspicious_ips(recent_attempts)
    
    # Return minimal response per prompt requirements
    response_data = {
        'suspicious_ips': list(suspicious_ips),
        'total_suspicious_ips': len(suspicious_ips)
    }
    
    return Response(response_data)
