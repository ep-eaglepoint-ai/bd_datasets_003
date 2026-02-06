import pytest
from django.conf import settings
from django.db import connections
from django.test import override_settings

@pytest.mark.django_db
def test_conn_max_age_setting():
    """Verify that the CONN_MAX_AGE setting is correctly applied in the main settings file."""
    import ecommerce.settings
    assert ecommerce.settings.DATABASES['default']['CONN_MAX_AGE'] == 600

@pytest.mark.django_db
def test_connection_persistence():
    """
    Verify that the connection wrapper reflects the persistent setting.
    Note: We cannot easily simulate multiple requests reusing a connection in a simple unit test 
    without a live server, but we can check the connection properties.
    """
    connection = connections['default']
    # Ensure connection is established
    connection.ensure_connection()
    
    # Check if the max_age param of the backend matches
    # Django's postgres backend stores this in settings_dict
    assert connection.settings_dict['CONN_MAX_AGE'] == 600
    
    # Also verify it allows reuse (close_at should be roughly now + 600, or handled by Django's loop)
    # This is internal Django logic, but checking settings_dict is the direct verification of configuration.
