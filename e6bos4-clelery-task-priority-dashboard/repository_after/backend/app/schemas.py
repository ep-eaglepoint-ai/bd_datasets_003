"""Pydantic schemas for API request/response validation."""
from datetime import datetime
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel, Field
from app.models import TaskStatus, TaskPriority


class TaskCreate(BaseModel):
    """Schema for creating a new task."""
    name: str = Field(..., min_length=1, max_length=255, description="Task name")
    task_type: str = Field(default="data_export", description="Type of task to execute")
    priority: TaskPriority = Field(default=TaskPriority.MEDIUM, description="Task priority")
    total_steps: int = Field(default=100, ge=1, le=10000, description="Total steps for progress tracking")
    
    class Config:
        json_schema_extra = {
            "example": {
                "name": "Export Sales Report Q4",
                "task_type": "data_export",
                "priority": "high",
                "total_steps": 1000
            }
        }


class TaskResponse(BaseModel):
    """Schema for task response."""
    id: int
    task_id: UUID
    celery_task_id: Optional[str] = None
    name: str
    task_type: str
    priority: TaskPriority
    status: TaskStatus
    progress: int
    progress_message: Optional[str] = None
    total_steps: int
    result: Optional[str] = None
    error: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class TaskListResponse(BaseModel):
    """Schema for paginated task list response."""
    tasks: List[TaskResponse]
    total: int
    page: int
    per_page: int


class TaskSubmitResponse(BaseModel):
    """Schema for task submission response."""
    task_id: UUID
    celery_task_id: str
    message: str
    status: TaskStatus
    
    class Config:
        json_schema_extra = {
            "example": {
                "task_id": "550e8400-e29b-41d4-a716-446655440000",
                "celery_task_id": "abc123-def456",
                "message": "Task submitted successfully",
                "status": "PENDING"
            }
        }


class ProgressUpdate(BaseModel):
    """Schema for WebSocket progress updates."""
    task_id: str
    status: str
    progress: int
    total: int
    message: Optional[str] = None
    error: Optional[str] = None
