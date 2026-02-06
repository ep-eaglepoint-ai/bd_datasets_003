"""
Real Integration Test for Priority Queues.
Verifies that High priority tasks are consumed before Low priority tasks using a real Redis broker and Celery worker.
"""
import pytest
import time
import redis
import subprocess
import sys
import os
from app.celery_app import celery_app
# Import tasks to ensure they are registered (though we use name str in apply_async key usually)
# We rely on 'app.tasks.priority_test_task' being available in the worker via app/tasks.py

# Redis connection for verification
r = redis.from_url("redis://redis:6379/0")

class TestRealPriorityIntegration:

    def setup_method(self):
        r.flushall()
        # Aggressive cleanup
        os.system("pkill -9 -f 'celery worker'")
        time.sleep(0.5)

    def teardown_method(self):
        if hasattr(self, 'worker_process') and self.worker_process:
            self.worker_process.terminate()
            try:
                self.worker_process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                self.worker_process.kill()
        os.system("pkill -9 -f 'celery worker'")

    def test_priority_ordering_real_redis(self):
        """
        Scenario: Push 10 Low tasks, then 1 High task.
        Verify High task is executed FIRST by the worker.
        
        Strategy: Submit ALL tasks FIRST, verify queue state, THEN start worker.
        This ensures worker sees complete queue state and consumes high priority first.
        """
        r.delete("execution_log")
        
        # Task name registered in app/tasks.py
        task_name = "app.tasks.priority_test_task"

        # STEP 1: Submit 10 Low priority tasks
        print("DEBUG: Submitting 10 low priority tasks...")
        for i in range(10):
            celery_app.send_task(
                task_name,
                args=["low"],
                queue="low",
                routing_key="low",
                priority=9  # Low priority (0=highest, 9=lowest)
            )
        
        # Small delay to ensure low tasks are routed
        time.sleep(0.2)

        # STEP 2: Submit 1 High priority task
        print("DEBUG: Submitting 1 high priority task...")
        celery_app.send_task(
            task_name,
            args=["high"],
            queue="high",
            routing_key="high",
            priority=0  # High priority (0=highest, 9=lowest)
        )

        # STEP 3: Wait and verify all tasks are in correct priority sub-queues
        # With priority_steps, Redis creates sub-queues like "low\x06\x169" for priority 9
        print("DEBUG: Waiting for tasks to be routed to priority sub-queues...")
        max_wait_iterations = 100
        
        # Check all Redis keys to find the priority sub-queues
        for i in range(max_wait_iterations):
            # Get all queue keys
            all_keys = r.keys("*")
            
            # Count tasks in high priority sub-queues (priority 0)
            high_count = sum(r.llen(k) for k in all_keys if k.startswith(b"high"))
            
            # Count tasks in low priority sub-queues (priority 9)
            low_count = sum(r.llen(k) for k in all_keys if k.startswith(b"low"))
            
            if high_count == 1 and low_count == 10:
                print(f"DEBUG: Queue routing complete - High priority tasks: {high_count}, Low priority tasks: {low_count}")
                print(f"DEBUG: All queue keys: {[k.decode() for k in all_keys if not k.startswith(b'_')]}")
                break
            
            if i == max_wait_iterations - 1:
                print(f"DEBUG: All queue keys: {[k.decode() for k in all_keys if not k.startswith(b'_')]}")
                raise AssertionError(
                    f"Queue routing failed after {max_wait_iterations * 0.1}s. "
                    f"Expected High=1, Low=10. Got High={high_count}, Low={low_count}"
                )
            
            time.sleep(0.1)
        
        # Additional delay to ensure Redis has fully committed all tasks
        time.sleep(1.0)
        
        # Verify final queue state before starting worker
        all_keys = r.keys("*")
        high_count = sum(r.llen(k) for k in all_keys if k.startswith(b"high"))
        low_count = sum(r.llen(k) for k in all_keys if k.startswith(b"low"))
        print(f"DEBUG: Final queue state before worker start - High: {high_count}, Low: {low_count}")
        assert high_count == 1, f"High priority queues should have 1 task, has {high_count}"
        assert low_count == 10, f"Low priority queues should have 10 tasks, has {low_count}"

        # STEP 4: NOW start the worker (after all tasks are queued)
        cmd = [
            sys.executable, "-m", "celery",
            "-A", "app.celery_app",
            "worker",
            "--loglevel=info",
            "--pool=solo",
            "--concurrency=1",  # Single worker for strict priority ordering
            "--without-gossip",
            "--without-mingle",
            "--without-heartbeat",
            "--prefetch-multiplier=1",
            "-Q", "high,medium,low"  # Worker will consume high queue first
        ]
        
        print(f"DEBUG: Starting worker AFTER tasks are queued: {' '.join(cmd)}")
        
        env = os.environ.copy()
        if "PYTHONPATH" not in env:
            backend_path = os.path.join(os.getcwd(), "repository_after", "backend")
            if os.path.exists(backend_path):
                env["PYTHONPATH"] = backend_path
            else:
                env["PYTHONPATH"] = os.getcwd()
        
        self.worker_process = subprocess.Popen(
            cmd,
            stdout=sys.stdout,
            stderr=sys.stderr,
            env=env
        )
        
        print("DEBUG: Worker started, waiting for task execution...")

        # STEP 5: Wait for all tasks to be processed
        max_wait_seconds = 30
        for i in range(max_wait_seconds * 2):  # Check every 0.5s
            execution_count = r.llen("execution_log")
            if execution_count >= 11:
                print(f"DEBUG: All 11 tasks executed after {i * 0.5}s")
                break
            time.sleep(0.5)
        else:
            execution_count = r.llen("execution_log")
            raise AssertionError(
                f"Timeout: Only {execution_count}/11 tasks executed after {max_wait_seconds}s"
            )

        # STEP 6: Verify execution order - High task MUST be first
        logs = [x.decode() for x in r.lrange("execution_log", 0, -1)]
        print(f"DEBUG: Execution order: {logs}")

        assert len(logs) == 11, f"Expected 11 tasks executed, got {len(logs)}"
        assert logs[0] == "high", (
            f"PRIORITY VIOLATION: High priority task executed at position "
            f"{logs.index('high') if 'high' in logs else 'MISSING'}. "
            f"Expected position 0. Full execution order: {logs}"
        )
        assert all(p == "low" for p in logs[1:]), (
            f"Expected remaining 10 tasks to be 'low', got: {logs[1:]}"
        )

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
