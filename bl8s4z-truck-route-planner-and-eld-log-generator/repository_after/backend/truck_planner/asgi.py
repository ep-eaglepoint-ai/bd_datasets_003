"""
ASGI config for truck_planner project.
"""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'truck_planner.settings')

application = get_asgi_application()
