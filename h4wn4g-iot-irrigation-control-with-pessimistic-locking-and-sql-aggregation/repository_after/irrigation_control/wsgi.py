"""WSGI config for irrigation_control project."""
import os
from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'irrigation_control.settings')

application = get_wsgi_application()