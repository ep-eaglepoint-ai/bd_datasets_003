import sys
import os
import pytest
from django.conf import settings

# Determine which repository to use based on PYTHONPATH
repo_path = os.environ.get('PYTHONPATH', os.path.join(os.path.dirname(__file__), '..', 'repository_after'))
if repo_path not in sys.path:
    sys.path.insert(0, repo_path)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'saas_platform.settings')


def pytest_configure(config):
    # Always use SQLite in-memory for tests to avoid schema conflicts
    # This ensures fresh database for each test run
    settings.DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': ':memory:',
        }
    }
    
    # Configure Redis cache if available, otherwise use in-memory
    if os.environ.get('REDIS_HOST'):
        settings.CACHES = {
            'default': {
                'BACKEND': 'django_redis.cache.RedisCache',
                'LOCATION': f"redis://{os.environ.get('REDIS_HOST', 'redis')}:{os.environ.get('REDIS_PORT', '6379')}/1",
                'OPTIONS': {
                    'CLIENT_CLASS': 'django_redis.client.DefaultClient',
                }
            }
        }
    else:
        settings.CACHES = {
            'default': {
                'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
            }
        }


@pytest.fixture(autouse=True)
def clear_cache(db):
    """Clear cache for each test"""
    from django.core.cache import cache
    cache.clear()
    yield
    cache.clear()
