"""
pytest configuration for Django tests.
"""

import os
import sys
import django
from django.conf import settings

# Add the backend directory to Python path
backend_path = os.path.join(os.path.dirname(__file__), 'repository_after', 'backend')
sys.path.insert(0, backend_path)

# Configure Django settings
if not settings.configured:
    settings.configure(
        DEBUG=True,
        DATABASES={
            'default': {
                'ENGINE': 'django.db.backends.sqlite3',
                'NAME': ':memory:',
            }
        },
        INSTALLED_APPS=[
            'django.contrib.auth',
            'django.contrib.contenttypes',
            'login_analyzer.app',
        ],
        SECRET_KEY='test-secret-key',
        USE_TZ=True,
    )

django.setup()
