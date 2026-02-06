"""
Tests for SQL aggregation functionality.
"""
import pytest
from datetime import timedelta
from django.utils import timezone
from django.db.models import Avg
from django.db.models.functions import TruncHour
from sensors.models import SensorReading


@pytest.mark.django_db
class TestSQLAggregation:
    """Tests verifying SQL aggregation is used correctly."""
    
    def test_trunchour_aggregation(self, zone, sensor):
        """REQUIREMENT 4: Test that TruncHour is properly used."""
        base_time = timezone.now() - timedelta(hours=5)
        
        for hour in range(5):
            for i in range(10):
                SensorReading.objects.create(
                    sensor=sensor,
                    zone=zone,
                    moisture_percentage=30 + hour * 2 + i * 0.1,
                    timestamp=base_time + timedelta(hours=hour, minutes=i * 5)
                )
        
        result = list(
            SensorReading.objects
            .filter(zone=zone)
            .annotate(hour=TruncHour('timestamp'))
            .values('hour')
            .annotate(avg_moisture=Avg('moisture_percentage'))
            .order_by('hour')
        )
        
        # Should have approximately 5-6 hourly buckets (timing may vary slightly)
        assert len(result) >= 5
        assert len(result) <= 7
        
        for entry in result:
            assert entry['avg_moisture'] is not None
            assert 30 <= entry['avg_moisture'] <= 42
    
    def test_no_python_loop_for_aggregation(self):
        """REQUIREMENT 4: Verify no Python loops are used for aggregation."""
        import inspect
        from sensors import views
        
        source = inspect.getsource(views.ZoneHourlyAverageView)
        
        assert 'for reading in' not in source.lower()
        assert 'TruncHour' in source
        assert 'Avg' in source
        assert 'annotate' in source
    
    def test_indexes_defined(self):
        """REQUIREMENT 7: Verify indexes are defined on the model."""
        indexes = SensorReading._meta.indexes
        index_fields = []
        for idx in indexes:
            index_fields.extend(idx.fields)
        
        assert 'zone' in index_fields
        assert 'timestamp' in index_fields