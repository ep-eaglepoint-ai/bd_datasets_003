from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import urlparse

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev-secret-key")
DEBUG = os.environ.get("DJANGO_DEBUG", "1") == "1"

ALLOWED_HOSTS: list[str] = ["*"]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "organizations",
]

ENABLE_DEBUG_TOOLBAR = os.environ.get("ENABLE_DEBUG_TOOLBAR", "0") == "1"
if ENABLE_DEBUG_TOOLBAR and DEBUG:
    INSTALLED_APPS += ["debug_toolbar"]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

# Insert Debug Toolbar middleware after Authentication.
if ENABLE_DEBUG_TOOLBAR and DEBUG:
    try:
        auth_index = MIDDLEWARE.index("django.contrib.auth.middleware.AuthenticationMiddleware")
    except ValueError:
        auth_index = 0
    MIDDLEWARE.insert(auth_index + 1, "debug_toolbar.middleware.DebugToolbarMiddleware")

INTERNAL_IPS = ["127.0.0.1"]

ROOT_URLCONF = "saas_dashboard.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    }
]

WSGI_APPLICATION = "saas_dashboard.wsgi.application"


def _database_from_env() -> dict:
    url = os.environ.get("DATABASE_URL")
    if not url:
        return {
            "default": {
                "ENGINE": "django.db.backends.sqlite3",
                "NAME": BASE_DIR / "db.sqlite3",
            }
        }

    parsed = urlparse(url)
    return {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": (parsed.path or "").lstrip("/") or "app",
            "USER": parsed.username or "app",
            "PASSWORD": parsed.password or "app",
            "HOST": parsed.hostname or "localhost",
            "PORT": parsed.port or 5432,
        }
    }


DATABASES = _database_from_env()

AUTH_PASSWORD_VALIDATORS: list[dict] = []

LANGUAGE_CODE = "en-us"

TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# Invitation expiry is configurable; default 7 days.
INVITATION_DEFAULT_TTL_DAYS = int(os.environ.get("INVITATION_DEFAULT_TTL_DAYS", "7"))

STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Email is used for invitations. Default to an in-memory backend to avoid
# external/network dependencies in evaluator environments.
EMAIL_BACKEND = os.environ.get("EMAIL_BACKEND", "django.core.mail.backends.locmem.EmailBackend")
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "no-reply@example.com")

# Used to construct invitation links.
FRONTEND_BASE_URL = os.environ.get("FRONTEND_BASE_URL", "")

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "saas-dashboard",
    }
}

redis_url = os.environ.get("REDIS_URL")
if redis_url:
    CACHES["default"] = {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": redis_url,
        "OPTIONS": {"CLIENT_CLASS": "django_redis.client.DefaultClient"},
    }

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
        "rest_framework.authentication.BasicAuthentication",
        "organizations.auth.APIKeyAuthentication",
    ],
    "DEFAULT_THROTTLE_CLASSES": [
        "organizations.throttling.APIKeySlidingWindowThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "apikey": "1000/hour",
    },
}
