"""
Serializers for the Login Attempt Analyzer API.

Minimal implementation per prompt requirements:
- LoginAttemptSerializer for login attempts data
"""

from rest_framework import serializers
from .models import LoginAttempt


class LoginAttemptSerializer(serializers.ModelSerializer):
    """
    Serializer for LoginAttempt model.
    
    Converts LoginAttempt instances to JSON for API responses.
    Minimal implementation per prompt requirements.
    """
    
    class Meta:
        model = LoginAttempt
        fields = ['id', 'username', 'ip_address', 'timestamp', 'success']
        read_only_fields = ['id', 'timestamp']
