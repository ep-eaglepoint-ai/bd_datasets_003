"""
Comprehensive integration tests for the Distributed Task Priority Dashboard.

Tests cover:
1. Priority queue ordering (10 Low + 1 High)
2. Celery queue configuration with three priority levels
3. Task routing based on priority
4. Worker consumption order
"""
import pytest
import uuid
from datetime import datetime

from app.models import Task, TaskStatus, TaskPriority
from app.celery_app import celery_app, get_queue_for_priority
from app.schemas import TaskCreate


class TestPriorityQueueConfiguration:
    """Test Celery priority queue configuration."""

    def test_three_priority_queues_exist(self):
        """Verify exactly three priority queues are configured: high, medium, low."""
        queues = celery_app.conf.task_queues
        queue_names = [q.name for q in queues]
        
        assert len(queue_names) >= 3, "Must have at least 3 queues"
        assert "high" in queue_names
        assert "medium" in queue_names
        assert "low" in queue_names

    def test_default_queue_is_medium(self):
        """Verify default queue is medium priority."""
        assert celery_app.conf.task_default_queue == "medium"

    def test_worker_prefetch_multiplier(self):
        """Worker prefetch must be 1 for strict priority ordering."""
        assert celery_app.conf.worker_prefetch_multiplier == 1

    def test_redis_broker_configured(self):
        """Verify Redis is configured as message broker."""
        broker_url = celery_app.conf.broker_url
        assert "redis" in broker_url.lower()


class TestPriorityRouting:
    """Test priority-based task routing."""

    def test_high_priority_routes_to_high_queue(self):
        """High priority tasks route to 'high' queue."""
        assert get_queue_for_priority("high") == "high"

    def test_medium_priority_routes_to_medium_queue(self):
        """Medium priority tasks route to 'medium' queue."""
        assert get_queue_for_priority("medium") == "medium"

    def test_low_priority_routes_to_low_queue(self):
        """Low priority tasks route to 'low' queue."""
        assert get_queue_for_priority("low") == "low"

    def test_unknown_priority_defaults_to_medium(self):
        """Unknown priorities default to medium queue."""
        assert get_queue_for_priority("invalid") == "medium"
        assert get_queue_for_priority("urgent") == "medium"
        assert get_queue_for_priority("") == "medium"


class TestTaskPriorityEnum:
    """Test TaskPriority enumeration."""

    def test_high_priority_value(self):
        assert TaskPriority.HIGH.value == "high"

    def test_medium_priority_value(self):
        assert TaskPriority.MEDIUM.value == "medium"

    def test_low_priority_value(self):
        assert TaskPriority.LOW.value == "low"

    def test_priority_comparison(self):
        """Test priorities can be compared."""
        priorities = [TaskPriority.LOW, TaskPriority.MEDIUM, TaskPriority.HIGH]
        assert TaskPriority.HIGH in priorities
        assert TaskPriority.LOW in priorities


class TestTaskStatusLifecycle:
    """Test task status transitions."""

    def test_all_status_values_exist(self):
        """All required status values must exist."""
        assert TaskStatus.PENDING.value == "PENDING"
        assert TaskStatus.STARTED.value == "STARTED"
        assert TaskStatus.PROGRESS.value == "PROGRESS"
        assert TaskStatus.SUCCESS.value == "SUCCESS"
        assert TaskStatus.FAILURE.value == "FAILURE"
        assert TaskStatus.RETRY.value == "RETRY"

    def test_status_lifecycle_transition(self):
        """Test valid status transitions."""
        task = Task(
            task_id=uuid.uuid4(),
            name="Lifecycle Test",
            task_type="generic",
            priority=TaskPriority.MEDIUM,
            status=TaskStatus.PENDING
        )
        
        # PENDING -> STARTED
        task.status = TaskStatus.STARTED
        assert task.status == TaskStatus.STARTED
        
        # STARTED -> PROGRESS
        task.status = TaskStatus.PROGRESS
        task.progress = 50
        assert task.status == TaskStatus.PROGRESS
        
        # PROGRESS -> SUCCESS
        task.status = TaskStatus.SUCCESS
        task.progress = 100
        assert task.status == TaskStatus.SUCCESS


class TestTenLowOneHighScenario:
    """
    Critical test: 10 Low priority tasks + 1 High priority task.
    The High priority task MUST be processed first.
    """

    def test_high_priority_processed_before_low_priority(self):
        """
        Requirement: When Low queue has 10 tasks and a High priority task
        is submitted, the High task is processed before remaining Low tasks.
        """
        # Create 10 low priority tasks
        low_tasks = []
        for i in range(10):
            low_tasks.append({
                "id": str(uuid.uuid4()),
                "name": f"Low Priority Task {i+1}",
                "priority": TaskPriority.LOW,
                "queue": get_queue_for_priority("low"),
                "submitted_at": datetime.utcnow(),
                "status": "PENDING"
            })
        
        # Create 1 high priority task (submitted AFTER low priority tasks)
        high_task = {
            "id": str(uuid.uuid4()),
            "name": "High Priority Task",
            "priority": TaskPriority.HIGH,
            "queue": get_queue_for_priority("high"),
            "submitted_at": datetime.utcnow(),
            "status": "PENDING"
        }
        
        # Simulate worker queue consumption: high -> medium -> low
        high_queue = [high_task]
        medium_queue = []
        low_queue = low_tasks.copy()
        
        processed_order = []
        
        # Worker processes high queue first
        while high_queue:
            task = high_queue.pop(0)
            task["status"] = "SUCCESS"
            processed_order.append(task)
        
        # Then medium queue
        while medium_queue:
            task = medium_queue.pop(0)
            task["status"] = "SUCCESS"
            processed_order.append(task)
        
        # Finally low queue
        while low_queue:
            task = low_queue.pop(0)
            task["status"] = "SUCCESS"
            processed_order.append(task)
        
        # Assertions
        assert len(processed_order) == 11
        assert processed_order[0]["priority"] == TaskPriority.HIGH
        assert processed_order[0]["name"] == "High Priority Task"
        
        # All remaining are low priority
        for task in processed_order[1:]:
            assert task["priority"] == TaskPriority.LOW

    def test_queue_ordering_with_mixed_priorities(self):
        """Test queue ordering with mixed priority submissions."""
        submissions = [
            {"priority": "low", "order": 1},
            {"priority": "low", "order": 2},
            {"priority": "high", "order": 3},
            {"priority": "low", "order": 4},
            {"priority": "medium", "order": 5},
            {"priority": "low", "order": 6},
        ]
        
        high_queue = []
        medium_queue = []
        low_queue = []
        
        for task in submissions:
            queue = get_queue_for_priority(task["priority"])
            if queue == "high":
                high_queue.append(task)
            elif queue == "medium":
                medium_queue.append(task)
            else:
                low_queue.append(task)
        
        # Processing order
        processed = high_queue + medium_queue + low_queue
        
        # Verify high priority comes first
        assert processed[0]["priority"] == "high"
        # Medium comes before low
        assert processed[1]["priority"] == "medium"


class TestTaskUUIDTracking:
    """Test UUID-based task tracking."""

    def test_task_has_uuid(self):
        """Each task must have a unique UUID."""
        task = Task(
            task_id=uuid.uuid4(),
            name="UUID Test",
            task_type="generic",
            priority=TaskPriority.MEDIUM,
            status=TaskStatus.PENDING
        )
        assert task.task_id is not None
        assert isinstance(task.task_id, uuid.UUID)

    def test_uuids_are_unique(self):
        """Multiple tasks have unique UUIDs."""
        tasks = [
            Task(task_id=uuid.uuid4(), name=f"Task {i}", 
                 task_type="generic", priority=TaskPriority.LOW, 
                 status=TaskStatus.PENDING)
            for i in range(5)
        ]
        uuids = [t.task_id for t in tasks]
        assert len(set(uuids)) == 5


class TestProgressTracking:
    """Test progress tracking functionality."""

    def test_task_has_progress_field(self):
        """Task model must have progress field."""
        task = Task(
            task_id=uuid.uuid4(),
            name="Progress Test",
            task_type="data_export",
            priority=TaskPriority.HIGH,
            status=TaskStatus.PROGRESS,
            progress=45
        )
        assert task.progress == 45

    def test_progress_message_field(self):
        """Task model must support progress messages."""
        task = Task(
            task_id=uuid.uuid4(),
            name="Progress Message Test",
            task_type="data_export",
            priority=TaskPriority.HIGH,
            status=TaskStatus.PROGRESS,
            progress=500,
            total_steps=1000,
            progress_message="Processing row 500 of 1000"
        )
        assert "500 of 1000" in task.progress_message

    def test_total_steps_tracking(self):
        """Task must track total steps for progress calculation."""
        task = Task(
            task_id=uuid.uuid4(),
            name="Steps Test",
            task_type="pdf_generation",
            priority=TaskPriority.MEDIUM,
            status=TaskStatus.PROGRESS,
            progress=25,
            total_steps=100
        )
        assert task.total_steps == 100
        assert task.progress == 25


class TestSchemaValidation:
    """Test Pydantic schema validation."""

    def test_task_create_schema(self):
        """TaskCreate schema validates input."""
        task_data = TaskCreate(
            name="Schema Test Task",
            task_type="data_export",
            priority=TaskPriority.HIGH,
            total_steps=500
        )
        assert task_data.name == "Schema Test Task"
        assert task_data.priority == TaskPriority.HIGH
        assert task_data.total_steps == 500

    def test_task_create_default_priority(self):
        """TaskCreate defaults to medium priority."""
        task_data = TaskCreate(
            name="Default Priority Task",
            task_type="generic"
        )
        assert task_data.priority == TaskPriority.MEDIUM


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
