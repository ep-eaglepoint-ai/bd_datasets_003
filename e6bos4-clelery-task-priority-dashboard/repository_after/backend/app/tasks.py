"""Celery tasks with progress tracking and error handling."""
import time
import random
import os
from datetime import datetime
from celery import Task as CeleryTask
from celery.exceptions import MaxRetriesExceededError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.celery_app import celery_app
from app.models import Task, TaskStatus

# Sync database connection for Celery workers
DATABASE_URL_SYNC = os.getenv(
    "DATABASE_URL_SYNC",
    "postgresql://postgres:postgres@postgres:5432/taskdb"
)
sync_engine = create_engine(DATABASE_URL_SYNC, pool_pre_ping=True)
SyncSessionLocal = sessionmaker(bind=sync_engine)


class ProgressTask(CeleryTask):
    """Base task class with progress tracking capabilities."""
    
    def update_progress(self, task_db_id: int, current: int, total: int, message: str = None):
        """Update task progress in database and Celery state."""
        # Update Celery state
        self.update_state(
            state="PROGRESS",
            meta={
                "current": current,
                "total": total,
                "message": message or f"Processing step {current} of {total}",
                "percent": int((current / total) * 100) if total > 0 else 0
            }
        )
        
        # Update database
        with SyncSessionLocal() as session:
            task = session.query(Task).filter(Task.id == task_db_id).first()
            if task:
                task.progress = int((current / total) * 100) if total > 0 else 0
                task.progress_message = message or f"Processing step {current} of {total}"
                task.status = TaskStatus.PROGRESS
                task.updated_at = datetime.utcnow()
                session.commit()


@celery_app.task(
    bind=True,
    base=ProgressTask,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=60,
    retry_jitter=True,
    max_retries=3,
    acks_late=True,
    track_started=True,
    name="app.tasks.execute_task"
)
def execute_task(
    self,
    task_db_id: int,
    task_type: str,
    total_steps: int = 100,
    should_fail: bool = False
):
    """
    Execute a long-running background task with progress updates.
    
    Args:
        task_db_id: Database ID of the task record
        task_type: Type of task (data_export, pdf_generation, report_generation)
        total_steps: Number of steps for progress tracking
        should_fail: If True, task will fail (for testing error handling)
    
    Returns:
        dict: Task result with completion details
    """
    # Mark task as started
    with SyncSessionLocal() as session:
        task = session.query(Task).filter(Task.id == task_db_id).first()
        if task:
            task.status = TaskStatus.STARTED
            task.started_at = datetime.utcnow()
            task.celery_task_id = self.request.id
            session.commit()
    
    try:
        result = None
        
        if task_type == "data_export":
            result = _simulate_data_export(self, task_db_id, total_steps, should_fail)
        elif task_type == "pdf_generation":
            result = _simulate_pdf_generation(self, task_db_id, total_steps, should_fail)
        elif task_type == "report_generation":
            result = _simulate_report_generation(self, task_db_id, total_steps, should_fail)
        elif task_type == "failing_task":
            raise ValueError("This task is designed to fail for testing purposes")
        else:
            result = _simulate_generic_task(self, task_db_id, total_steps, should_fail)
        
        # Mark task as successful
        with SyncSessionLocal() as session:
            task = session.query(Task).filter(Task.id == task_db_id).first()
            if task:
                task.status = TaskStatus.SUCCESS
                task.progress = 100
                task.progress_message = "Task completed successfully"
                task.result = str(result)
                task.completed_at = datetime.utcnow()
                session.commit()
        
        return result
        
    except Exception as exc:
        # Handle failure
        with SyncSessionLocal() as session:
            task = session.query(Task).filter(Task.id == task_db_id).first()
            if task:
                # Update status for retry attempt
                task.status = TaskStatus.RETRY
                task.error = f"Retry {self.request.retries + 1}/{self.max_retries}: {str(exc)}"
                session.commit()
                
                try:
                    # Attempt retry (this always raises)
                    raise self.retry(exc=exc)
                except MaxRetriesExceededError:
                    # Max retries exceeded - mark as failed
                    task.status = TaskStatus.FAILURE
                    task.error = str(exc)
                    task.completed_at = datetime.utcnow()
                    session.commit()
                    raise
        raise


def _simulate_data_export(task_self: ProgressTask, task_db_id: int, total_steps: int, should_fail: bool) -> dict:
    """Simulate a data export operation with progress updates."""
    rows_exported = 0
    
    for i in range(1, total_steps + 1):
        # Simulate processing time
        time.sleep(0.05)
        
        # Simulate potential failure
        if should_fail and i == total_steps // 2:
            raise ConnectionError("Database connection lost during export")
        
        rows_exported += random.randint(10, 50)
        task_self.update_progress(
            task_db_id,
            current=i,
            total=total_steps,
            message=f"Exporting data: row {rows_exported} processed"
        )
    
    return {
        "type": "data_export",
        "rows_exported": rows_exported,
        "file_path": "/exports/data_export_2024.csv",
        "completed": True
    }


def _simulate_pdf_generation(task_self: ProgressTask, task_db_id: int, total_steps: int, should_fail: bool) -> dict:
    """Simulate PDF generation with progress updates."""
    pages_generated = 0
    
    for i in range(1, total_steps + 1):
        time.sleep(0.08)
        
        if should_fail and i == total_steps // 3:
            raise MemoryError("Insufficient memory for PDF rendering")
        
        pages_generated += 1
        task_self.update_progress(
            task_db_id,
            current=i,
            total=total_steps,
            message=f"Generating PDF: page {pages_generated} of {total_steps}"
        )
    
    return {
        "type": "pdf_generation",
        "pages": pages_generated,
        "file_path": "/exports/report.pdf",
        "file_size_mb": round(pages_generated * 0.15, 2),
        "completed": True
    }


def _simulate_report_generation(task_self: ProgressTask, task_db_id: int, total_steps: int, should_fail: bool) -> dict:
    """Simulate report generation with multiple phases."""
    phases = ["Collecting data", "Analyzing metrics", "Building charts", "Formatting output"]
    
    steps_per_phase = total_steps // len(phases)
    current_step = 0
    
    for phase_idx, phase in enumerate(phases):
        for i in range(steps_per_phase):
            time.sleep(0.04)
            
            if should_fail and phase_idx == 2 and i == steps_per_phase // 2:
                raise RuntimeError("Chart rendering failed")
            
            current_step += 1
            task_self.update_progress(
                task_db_id,
                current=current_step,
                total=total_steps,
                message=f"{phase}: {((i + 1) / steps_per_phase * 100):.0f}% complete"
            )
    
    return {
        "type": "report_generation",
        "sections": len(phases),
        "charts_generated": 12,
        "file_path": "/exports/quarterly_report.xlsx",
        "completed": True
    }


def _simulate_generic_task(task_self: ProgressTask, task_db_id: int, total_steps: int, should_fail: bool) -> dict:
    """Simulate a generic long-running task."""
    for i in range(1, total_steps + 1):
        time.sleep(0.03)
        
        if should_fail and i == total_steps * 0.7:
            raise Exception("Generic task failure")
        
        task_self.update_progress(
            task_db_id,
            current=i,
            total=total_steps,
            message=f"Processing step {i} of {total_steps}"
        )
    
    return {
        "type": "generic",
        "steps_completed": total_steps,
        "completed": True
    }
