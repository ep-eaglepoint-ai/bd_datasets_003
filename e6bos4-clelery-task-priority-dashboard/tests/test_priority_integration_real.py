"""
Real Integration Test for Priority Queues.
Verifies that High priority tasks are consumed before Low priority tasks using a real Redis broker and Celery worker.
"""
import pytest
import time
import redis
import threading
from app.celery_app import celery_app

# Redis connection for verification
r = redis.from_url("redis://redis:6379/0")

def start_worker():
    """Start a temporary Celery worker in a separate thread with strict priority ordering."""
    # EXPLICITLY set the strategy immediately before starting
    celery_app.conf.broker_transport_options = {"queue_order_strategy": "priority"}
    
    argv = [
        'worker',
        '--loglevel=info', 
        '--pool=prefork',
        '--concurrency=1', 
        '-Q', 'high,medium,low', 
        '--prefetch-multiplier=1'
    ]
    print(f"DEBUG: Starting worker with args: {argv}")
    celery_app.worker_main(argv)

class TestRealPriorityIntegration:

    def setup_method(self):
        r.flushall()

    def test_priority_ordering_real_redis(self):
        """
        Scenario: Push 10 Low tasks, then 1 High task.
        Verify High task is executed FIRST by the worker.
        """
        r.delete("execution_log")

        @celery_app.task(name="app.tasks.test_logger", bind=True)
        def test_logger_task(self, task_id, priority):
            r.rpush("execution_log", priority)
            return priority

        # 1. Submit 10 Low Tasks
        for i in range(10):
            test_logger_task.apply_async(
                args=[f"low_{i}", "low"],
                queue="low"
            )

        # 2. Submit 1 High Task
        test_logger_task.apply_async(
            args=["high_1", "high"],
            queue="high"
        )

        # Wait/Poll for queues to be populated (Robust check)
        print("DEBUG: Waiting for tasks to persist in Redis...")
        for _ in range(100): # Wait up to 10s
            if r.llen("high") == 1 and r.llen("low") == 10:
                break
            time.sleep(0.1)
        
        # Verify Queue State (Diagnose Routing vs Consumption)
        high_len = r.llen("high")
        low_len = r.llen("low")
        medium_len = r.llen("medium")
        print(f"DEBUG: Queue State -> High: {high_len}, Low: {low_len}, Medium: {medium_len}")
        print(f"DEBUG: Config -> {celery_app.conf.broker_transport_options}")

        # Fail FAST if routing is broken
        assert high_len == 1, f"Routing Failure: High queue has {high_len} tasks (Expected 1). Check task_routes."
        assert low_len == 10, f"Routing Failure: Low queue has {low_len} tasks (Expected 10). Check task_routes."

        # 3. Start Worker
        # FORCE strict ordering by specifying queues in order
        worker_thread = threading.Thread(
            target=start_worker, 
            daemon=True
        )
        worker_thread.start()

        # 4. Wait for processing (Expect 11 tasks)
        for _ in range(20):
            if r.llen("execution_log") >= 11:
                break
            time.sleep(0.5)

        # 5. Verify High priority processed first
        logs = [x.decode() for x in r.lrange("execution_log", 0, -1)]
        print(f"Execution Log: {logs}")

        assert len(logs) == 11, "Not all tasks were processed"
        assert logs[0] == "high", "High priority task was NOT processed first!"
        assert all(p == "low" for p in logs[1:]), "Remaining tasks should be low"

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
