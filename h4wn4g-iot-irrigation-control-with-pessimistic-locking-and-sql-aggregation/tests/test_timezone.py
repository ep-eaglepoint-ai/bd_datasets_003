"""
Tests for timezone handling.
REQUIREMENT 9: Must use django.utils.timezone.now() instead of datetime.now()
"""
import pytest
import inspect


class TestTimezoneUsage:
    """Tests verifying proper timezone usage."""
    
    def test_views_use_timezone_now(self):
        """
        REQUIREMENT 9: Views must use django.utils.timezone.now()
        """
        from sensors import views
        source = inspect.getsource(views)
        
        # Should use timezone.now()
        assert 'timezone.now()' in source
        
        # Should NOT use datetime.now() directly
        assert 'datetime.now()' not in source
    
    def test_models_use_timezone_now(self):
        """
        REQUIREMENT 9: Models must use django.utils.timezone.now()
        """
        from sensors import models
        source = inspect.getsource(models)
        
        # Should use timezone.now as default
        assert 'timezone.now' in source
    
    def test_tasks_use_timezone_now(self):
        """
        REQUIREMENT 9: Tasks must use django.utils.timezone.now()
        """
        from sensors import tasks
        source = inspect.getsource(tasks)
        
        assert 'timezone.now()' in source
        assert 'datetime.now()' not in source