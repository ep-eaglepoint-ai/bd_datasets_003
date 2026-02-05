"""
Real Integration Test for Priority Queues.

This test connects to a REAL Redis broker and spawns a REAL Celery worker
process to verify that High priority tasks are consumed before Low priority tasks.
"""
import pytest
import time
import redis
import threading
from app.celery_app import celery_app
from app.models import TaskPriority

# Redis connection for verification
r = redis.from_url("redis://redis:6379/0")

def start_worker():
    """Start a temporary Celery worker in a separate thread."""
    # Important: We must use the exact queue configuration requested by the lead
    # -Q high,medium,low ensures strict priority ordering
    argv = [
        'worker',
        '--loglevel=warning',
        '-Q', 'high,medium,low',
        '--concurrency=1',  # Concurrency 1 to force serial execution (proving order)
        '--prefetch-multiplier=1'
    ]
    celery_app.worker_main(argv)

class TestRealPriorityIntegration:

    def setup_method(self):
        """Clear Redis queues before each test."""
        r.flushall()

    def test_priority_ordering_real_redis(self):
        """
        Integration Scenario:
        1. Push 10 'Low' priority tasks to Redis
        2. Push 1 'High' priority task to Redis
        3. Start a real Celery worker
        4. Verify that the High task is executed FIRST
        """
        execution_order = []

        # 1. Define a mock task that appends to our list
        # We assume the worker code imports 'app.tasks' which creates the task registry
        # But since we are running the worker in-process, we can hook into it?
        # Actually, sharing memory between Celery worker (process) and test is hard unless using threads.
        # celery_app.worker_main usually starts processes.
        # Ideally, we inspect the Redis 'celery' key or results.
        
        # Alternative: We use a shared Redis list to log execution order
        r.delete("execution_log")

        @celery_app.task(name="app.tasks.test_logger", bind=True)
        def test_logger_task(self, task_id, priority):
            # Log successful execution to Redis list
            r.rpush("execution_log", priority)
            return priority

        # 2. Submit 10 Low Tasks
        # We manually send them to the correct queue to ensure they are waiting
        for i in range(10):
            test_logger_task.apply_async(
                args=[f"low_{i}", "low"],
                queue="low",
                routing_key="low"
            )

        # 3. Submit 1 High Task
        test_logger_task.apply_async(
            args=["high_1", "high"],
            queue="high",
            routing_key="high"
        )

        time.sleep(0.5) # Ensure all tasks are in Redis

        # 4. Start Worker (Thread based for testing)
        # We use a thread so we can stop it or check results parallel
        worker_thread = threading.Thread(target=start_worker, daemon=True)
        worker_thread.start()

        # 5. Wait for processing
        # We expect 11 tasks. Wait up to 10 seconds.
        for _ in range(20):
            if r.llen("execution_log") >= 11:
                break
            time.sleep(0.5)

        # 6. Verify Log
        logs = [x.decode() for x in r.lrange("execution_log", 0, -1)]
        print(f"Execution Log: {logs}")

        assert len(logs) == 11, "Not all tasks were processed"
        assert logs[0] == "high", "High priority task was NOT processed first!"
        assert all(p == "low" for p in logs[1:]), "Remaining tasks should be low"

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
