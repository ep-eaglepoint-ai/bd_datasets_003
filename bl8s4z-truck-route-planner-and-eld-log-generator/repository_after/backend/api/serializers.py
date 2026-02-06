"""
Serializers for trip planning API.
"""
from rest_framework import serializers


class TripInputSerializer(serializers.Serializer):
    """Serializer for trip input data validation."""
    current_location = serializers.CharField(
        required=True,
        min_length=2,
        max_length=500,
        error_messages={
            'required': 'Current location is required',
            'blank': 'Current location cannot be empty',
            'min_length': 'Current location must be at least 2 characters',
        }
    )
    pickup_location = serializers.CharField(
        required=True,
        min_length=2,
        max_length=500,
        error_messages={
            'required': 'Pickup location is required',
            'blank': 'Pickup location cannot be empty',
            'min_length': 'Pickup location must be at least 2 characters',
        }
    )
    dropoff_location = serializers.CharField(
        required=True,
        min_length=2,
        max_length=500,
        error_messages={
            'required': 'Drop-off location is required',
            'blank': 'Drop-off location cannot be empty',
            'min_length': 'Drop-off location must be at least 2 characters',
        }
    )
    current_cycle_hours = serializers.FloatField(
        required=True,
        min_value=0,
        max_value=70,
        error_messages={
            'required': 'Current cycle hours used is required',
            'min_value': 'Cycle hours cannot be negative',
            'max_value': 'Cycle hours cannot exceed 70 (8-day limit)',
        }
    )

    def validate_current_cycle_hours(self, value):
        """Validate cycle hours are within legal limits."""
        if value < 0:
            raise serializers.ValidationError('Cycle hours cannot be negative')
        if value > 70:
            raise serializers.ValidationError(
                'Cycle hours exceed the 70-hour/8-day limit. Driver must take a reset.'
            )
        return value


class StopSerializer(serializers.Serializer):
    """Serializer for route stops."""
    type = serializers.ChoiceField(
        choices=['pickup', 'dropoff', 'rest', 'fuel', 'break']
    )
    location = serializers.CharField()
    latitude = serializers.FloatField()
    longitude = serializers.FloatField()
    arrival_time = serializers.DateTimeField()
    departure_time = serializers.DateTimeField()
    duration_hours = serializers.FloatField()
    notes = serializers.CharField(required=False, allow_blank=True)
    miles_from_start = serializers.FloatField()


class RouteSegmentSerializer(serializers.Serializer):
    """Serializer for route segments."""
    from_location = serializers.CharField()
    to_location = serializers.CharField()
    distance_miles = serializers.FloatField()
    duration_hours = serializers.FloatField()
    coordinates = serializers.ListField(child=serializers.ListField())


class LogEntrySerializer(serializers.Serializer):
    """Serializer for individual ELD log entries."""
    status = serializers.ChoiceField(
        choices=['off_duty', 'sleeper_berth', 'driving', 'on_duty_not_driving']
    )
    start_time = serializers.DateTimeField()
    end_time = serializers.DateTimeField()
    duration_hours = serializers.FloatField()
    location = serializers.CharField()
    notes = serializers.CharField(required=False, allow_blank=True)


class DailyLogSerializer(serializers.Serializer):
    """Serializer for daily ELD log sheets."""
    date = serializers.DateField()
    day_number = serializers.IntegerField()
    entries = LogEntrySerializer(many=True)
    total_driving_hours = serializers.FloatField()
    total_on_duty_hours = serializers.FloatField()
    total_off_duty_hours = serializers.FloatField()
    total_sleeper_hours = serializers.FloatField()
    miles_driven = serializers.FloatField()
    starting_location = serializers.CharField()
    ending_location = serializers.CharField()
    cycle_hours_used = serializers.FloatField()
    cycle_hours_remaining = serializers.FloatField()


class TripResultSerializer(serializers.Serializer):
    """Serializer for complete trip planning result."""
    route = serializers.DictField()
    stops = StopSerializer(many=True)
    daily_logs = DailyLogSerializer(many=True)
    summary = serializers.DictField()
