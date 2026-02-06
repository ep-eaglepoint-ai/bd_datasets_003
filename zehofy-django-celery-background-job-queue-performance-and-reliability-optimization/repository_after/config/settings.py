"""
Django settings for ZEHOFY project with optimized Celery configuration.
"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', 'django-insecure-dev-key-change-in-production')

DEBUG = os.environ.get('DEBUG', 'True').lower() in ('true', '1', 'yes')

ALLOWED_HOSTS = ['*']

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'django_celery_results',
    'apps.tasks',
    'apps.reports',
    'apps.notifications',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ.get('DB_NAME', 'jobqueue'),
        'USER': os.environ.get('DB_USER', 'postgres'),
        'PASSWORD': os.environ.get('DB_PASSWORD', 'postgres'),
        'HOST': os.environ.get('DB_HOST', 'localhost'),
        'PORT': os.environ.get('DB_PORT', '5432'),
    }
}

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# =============================================================================
# CELERY CONFIGURATION - Performance and Reliability Optimizations
# =============================================================================

# Broker and Result Backend
CELERY_BROKER_URL = os.environ.get('REDIS_URL', 'redis://localhost:6379/0')
CELERY_RESULT_BACKEND = 'django-db'

# Serialization
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = 'UTC'

# =============================================================================
# PRIORITY QUEUES - Priority emails/notifications before bulk imports
# =============================================================================
# Define queues as a list of dictionaries (Celery 5.x compatible)
CELERY_TASK_QUEUES = [
    {
        'name': 'priority',
        'routing_key': 'priority',
        'queue_arguments': {
            'x-max-priority': 10,
            'x-message-ttl': 86400000,  # 24 hour TTL
        }
    },
    {
        'name': 'default',
        'routing_key': 'default',
        'queue_arguments': {
            'x-max-priority': 10,
            'x-message-ttl': 86400000,
        }
    },
    {
        'name': 'bulk',
        'routing_key': 'bulk',
        'queue_arguments': {
            'x-max-priority': 10,
            'x-message-ttl': 86400000,
        }
    },
]

# Route tasks to appropriate queues
CELERY_TASK_ROUTES = {
    # Priority tasks go to priority queue
    'apps.tasks.email_tasks.*': {'queue': 'priority', 'priority': 8},
    'apps.tasks.notification_tasks.*': {'queue': 'priority', 'priority': 9},
    'apps.tasks.report_tasks.*': {'queue': 'default', 'priority': 5},
    # Bulk imports go to bulk queue
    'apps.tasks.import_tasks.*': {'queue': 'bulk', 'priority': 1},
}

# =============================================================================
# RELIABILITY - Acks late to prevent task loss on worker crash
# =============================================================================
CELERY_TASK_ACKS_LATE = True  # Acknowledge after task completes, not on pickup
CELERY_TASK_REJECT_ON_WORKER_LOST = True  # Requeue task if worker dies

# =============================================================================
# RETRY WITH EXPONENTIAL BACKOFF AND JITTER
# =============================================================================
CELERY_TASK_DEFAULT_RATE_LIMIT = '100/m'  # Default rate limit
CELERY_DISABLE_RATE_LIMITS = False  # Enable rate limiting

# Exponential backoff: 60s, 120s, 240s, 480s, 960s (max 15 min = 900s)
CELERY_TASK_EXP_BACKOFF = True
CELERY_TASK_EXP_BACKOFF_MAX = 900  # Maximum 15 minutes
CELERY_TASK_BACKOFF_JITTER = True  # Add random jitter to prevent thundering herd

# =============================================================================
# WORKER PREFETCH - Prevent task grabbing monopoly
# =============================================================================
CELERY_WORKER_PREFETCH_MULTIPLIER = 1  # Workers grab one task at a time

# =============================================================================
# RESULT EXPIRATION - Prevent unbounded Redis memory growth
# =============================================================================
CELERY_RESULT_EXPIRES = int(os.environ.get('CELERY_RESULT_EXPIRES', 3600))  # 1 hour default
CELERY_RESULT_EXTENDED = True

# =============================================================================
# TASK TIMEOUTS - Prevent runaway tasks
# =============================================================================
CELERY_TASK_SOFT_TIME_LIMIT = 300  # Soft timeout: 5 minutes
CELERY_TASK_TIME_LIMIT = 360  # Hard timeout: 6 minutes

# =============================================================================
# WORKER CONCURRENCY
# =============================================================================
CELERY_WORKER_CONCURRENCY = int(os.environ.get('CELERY_CONCURRENCY', 4))
CELERY_WORKER_MAX_TASKS_PER_CHILD = 1000  # Restart worker after 1000 tasks to prevent memory leaks

# =============================================================================
# MEMORY PROTECTION
# =============================================================================
CELERY_WORKER_DISABLE_RATE_LIMITS = False
CELERY_TASK_IGNORE_RESULT = False  # Store results for monitoring
CELERY_TASK_STORE_ERRORS_IF_IGNORED = True

# =============================================================================
# BULK IMPORT OPTIMIZATIONS
# =============================================================================
CELERY_BATCH_SIZE = 100  # Batch size for bulk operations
CELERY_BATCH_TIMEOUT = 1.0  # Timeout for batch operations
