"""
Celery application configuration with priority queues, reliable delivery, and bounded prefetch.
"""
from celery import Celery
from celery.signals import worker_process_init, worker_process_shutdown
import os
import tracemalloc

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

# Create Celery app with priority queue support
app = Celery('jobqueue')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()

# Track memory usage for debugging
_memory_snapshot = None

@worker_process_init.connect
def init_worker(sender, **kwargs):
    """Initialize memory tracking when worker starts."""
    global _memory_snapshot
    tracemalloc.start()
    _memory_snapshot = tracemalloc.take_snapshot()

@worker_process_shutdown.connect
def shutdown_worker(sender, **kwargs):
    """Log memory usage when worker shuts down."""
    global _memory_snapshot
    if _memory_snapshot:
        current, peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()
        print(f"Worker memory - Current: {current / 1024:.1f}KB, Peak: {peak / 1024:.1f}KB")

# Debug task for testing
@app.task(bind=True, queue='priority')
def debug_task(self):
    """Debug task to verify Celery is working."""
    print(f'Request: {self.request!r}')
    return {'status': 'ok', 'task_id': self.request.id}
