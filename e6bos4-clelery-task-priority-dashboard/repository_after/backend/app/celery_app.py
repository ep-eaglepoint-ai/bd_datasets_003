"""Celery application configuration with priority-based queuing."""
from celery import Celery
from kombu import Queue
import os

# Redis broker URL
CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://redis:6379/0")
CELERY_RESULT_BACKEND = os.getenv(
    "CELERY_RESULT_BACKEND", 
    "db+postgresql://postgres:postgres@postgres:5432/taskdb"
)

# Create Celery application
celery_app = Celery(
    "task_dashboard",
    broker=CELERY_BROKER_URL,
    backend=CELERY_RESULT_BACKEND,
    include=["app.tasks"]
)

# Configure Celery with priority queues
celery_app.conf.update(
    # Task serialization
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    
    # Timezone
    timezone="UTC",
    enable_utc=True,
    
    # Result backend settings
    result_expires=86400,  # 24 hours
    result_extended=True,
    
    # Task tracking
    task_track_started=True,
    task_send_sent_event=True,
    
    # Worker settings
    worker_prefetch_multiplier=1,  # Important for priority ordering
    worker_concurrency=4,
    
    # Priority queue configuration
    # task_queues=(
    #     Queue("high", routing_key="high"),
    #     Queue("medium", routing_key="medium"),
    #     Queue("low", routing_key="low"),
    # ),
    
    # Default queue
    task_default_queue="medium",
    task_default_routing_key="medium",
    
    # Route tasks based on priority
    task_routes={
        "app.tasks.execute_task": {
            "queue": "medium",
            "routing_key": "medium"
        }
    },
    
    # Retry settings
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    
    # Transport options
    broker_transport_options={
        "queue_order_strategy": "priority"
    },
)


def get_queue_for_priority(priority: str) -> str:
    """Map priority level to queue name."""
    priority_map = {
        "high": "high",
        "medium": "medium", 
        "low": "low"
    }
    return priority_map.get(priority.lower(), "medium")
