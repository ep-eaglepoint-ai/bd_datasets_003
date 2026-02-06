from pathlib import Path
from .settings import *

BASE_DIR = Path(__file__).resolve().parent.parent
import os

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': 'ecommerce',
        'USER': 'mac',
        'PASSWORD': os.environ.get('DB_PASSWORD', 'postgres'),
        'HOST': os.environ.get('DB_HOST', 'localhost'),
        'PORT': '5432',
        'CONN_MAX_AGE': 600,
    }
}

# Override cache for testing (use LocMemCache to avoid Redis dependency)
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
    }
}
