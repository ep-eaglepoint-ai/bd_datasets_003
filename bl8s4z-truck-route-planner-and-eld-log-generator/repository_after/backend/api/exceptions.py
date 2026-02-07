"""
Custom exception handler for API errors.
"""
from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status


def custom_exception_handler(exc, context):
    """
    Custom exception handler that provides consistent error responses.
    """
    response = exception_handler(exc, context)

    if response is not None:
        response.data['status_code'] = response.status_code
        return response

    return Response(
        {
            'error': str(exc),
            'message': 'An unexpected error occurred',
            'status_code': 500
        },
        status=status.HTTP_500_INTERNAL_SERVER_ERROR
    )


class ValidationError(Exception):
    """Custom validation error for trip data."""
    def __init__(self, message, field=None):
        self.message = message
        self.field = field
        super().__init__(self.message)


class LocationError(Exception):
    """Error for invalid location data."""
    def __init__(self, message, location=None):
        self.message = message
        self.location = location
        super().__init__(self.message)


class CycleExceededError(Exception):
    """Error when driving cycle limits are exceeded."""
    def __init__(self, message, hours_available=None, hours_needed=None):
        self.message = message
        self.hours_available = hours_available
        self.hours_needed = hours_needed
        super().__init__(self.message)
