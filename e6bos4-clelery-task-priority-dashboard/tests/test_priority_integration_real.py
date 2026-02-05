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
        """
        r.delete("execution_log")
        
        # We use the statically defined task in app/tasks.py
        # Task Name: app.tasks.priority_test_task
        task_name = "app.tasks.priority_test_task"

        # 1. Submit 10 Low Tasks
        for i in range(10):
            celery_app.send_task(
                task_name,
                args=["low"],
                queue="low",
                routing_key="low"
            )

        # 2. Submit 1 High Task
        celery_app.send_task(
            task_name,
            args=["high"],
            queue="high",
            routing_key="high"
        )

        # Wait/Poll for queues to be populated
        print("DEBUG: Waiting for tasks to persist in Redis...")
        for _ in range(100): 
            if r.llen("high") == 1 and r.llen("low") == 10:
                break
            time.sleep(0.1)
        
        # Verify Queue State
        high_len = r.llen("high")
        low_len = r.llen("low")
        print(f"DEBUG: Queue State -> High: {high_len}, Low: {low_len}")
        
        assert high_len == 1, f"Routing Failure: High queue has {high_len} tasks"
        assert low_len == 10, f"Routing Failure: Low queue has {low_len} tasks"

        # 3. Start Worker (Subprocess)
        # Using sys.executable to ensure we use the same python environment
        # STRICT PRIORITY: -Q high,medium,low
        # Disable gossip/mingle to ensure strict queue priority
        cmd = [
            sys.executable, "-m", "celery",
            "-A", "app.celery_app",
            "worker",
            "--loglevel=info",
            "--pool=solo",  # Use solo pool for strict ordering
            "--without-gossip",
            "--without-mingle",
            "--without-heartbeat",
            "--prefetch-multiplier=1",
            "-Q", "high,medium,low"
        ]
        
        print(f"DEBUG: Starting worker subprocess: {' '.join(cmd)}")
        
        env = os.environ.copy()
        # Use existing PYTHONPATH from environment (set by docker-compose)
        # or fallback to repository_after/backend if not set
        if "PYTHONPATH" not in env:
            backend_path = os.path.join(os.getcwd(), "repository_after", "backend")
            if os.path.exists(backend_path):
                env["PYTHONPATH"] = backend_path
            else:
                env["PYTHONPATH"] = os.getcwd()
        
        self.worker_process = subprocess.Popen(
            cmd,
            stdout=sys.stdout,
            stderr=sys.stderr, # Capture stderr to debug if tasks are unknown
            env=env
        )

        # 4. Wait for processing 
        for _ in range(60):
            if r.llen("execution_log") >= 11:
                break
            time.sleep(0.5)

        # 5. Verify High priority processed first
        logs = [x.decode() for x in r.lrange("execution_log", 0, -1)]
        print(f"Execution Log: {logs}")

        assert len(logs) == 11, "Not all tasks were processed"
        assert logs[0] == "high", f"High priority executed at index {logs.index('high') if 'high' in logs else 'missing'}. Full logs: {logs}"
        assert all(p == "low" for p in logs[1:]), "Remaining tasks should be low"

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
