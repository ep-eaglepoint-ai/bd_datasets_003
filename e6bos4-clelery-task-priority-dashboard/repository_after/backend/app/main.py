"""FastAPI main application with REST endpoints and WebSocket support."""
import uuid
from datetime import datetime
from typing import Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Depends, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func

from app.config import get_settings
from app.database import get_db, engine, Base
from app.models import Task, TaskStatus, TaskPriority
from app.schemas import TaskCreate, TaskResponse, TaskListResponse, TaskSubmitResponse
from app.celery_app import celery_app, get_queue_for_priority
from app.tasks import execute_task
from app.websocket import manager


settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler for startup/shutdown."""
    # Startup: Initialize database tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    # Shutdown: Close connections
    await engine.dispose()


# Create FastAPI application
app = FastAPI(
    title=settings.APP_NAME,
    description="Distributed Task Priority Dashboard with Celery Workers",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# Health Check Endpoints
# ============================================================================

@app.get("/health", tags=["Health"])
async def health_check():
    """Basic health check endpoint."""
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}


@app.get("/api/health", tags=["Health"])
async def api_health_check(db: AsyncSession = Depends(get_db)):
    """Health check with database connectivity."""
    try:
        await db.execute(select(func.count()).select_from(Task))
        db_status = "connected"
    except Exception as e:
        db_status = f"error: {str(e)}"
    
    # Check Celery/Redis connectivity
    try:
        celery_app.control.ping(timeout=1)
        celery_status = "connected"
    except Exception:
        celery_status = "disconnected"
    
    return {
        "status": "healthy",
        "database": db_status,
        "celery": celery_status,
        "timestamp": datetime.utcnow().isoformat()
    }


# ============================================================================
# Task Management Endpoints
# ============================================================================

@app.post("/api/tasks", response_model=TaskSubmitResponse, status_code=201, tags=["Tasks"])
async def submit_task(
    task_data: TaskCreate,
    db: AsyncSession = Depends(get_db)
):
    """
    Submit a new background task for async processing.
    
    Returns a UUID for tracking and the Celery task ID.
    """
    # Create database record
    task = Task(
        task_id=uuid.uuid4(),
        name=task_data.name,
        task_type=task_data.task_type,
        priority=task_data.priority,
        status=TaskStatus.PENDING,
        total_steps=task_data.total_steps,
        progress=0
    )
    
    db.add(task)
    await db.commit()
    await db.refresh(task)
    
    # Determine queue based on priority
    queue_name = get_queue_for_priority(task_data.priority.value)
    
    # Submit to Celery with priority routing
    celery_result = execute_task.apply_async(
        args=[task.id, task_data.task_type, task_data.total_steps, False],
        queue=queue_name,
        routing_key=queue_name
    )
    
    # Update with Celery task ID
    task.celery_task_id = celery_result.id
    await db.commit()
    
    # Broadcast new task event
    await manager.broadcast_all({
        "type": "task_created",
        "task": task.to_dict()
    })
    
    return TaskSubmitResponse(
        task_id=task.task_id,
        celery_task_id=celery_result.id,
        message="Task submitted successfully",
        status=TaskStatus.PENDING
    )


@app.get("/api/tasks", response_model=TaskListResponse, tags=["Tasks"])
async def list_tasks(
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(20, ge=1, le=100, description="Items per page"),
    status: Optional[TaskStatus] = Query(None, description="Filter by status"),
    priority: Optional[TaskPriority] = Query(None, description="Filter by priority"),
    db: AsyncSession = Depends(get_db)
):
    """List all tasks with optional filtering and pagination."""
    # Build query
    query = select(Task)
    count_query = select(func.count()).select_from(Task)
    
    if status:
        query = query.where(Task.status == status)
        count_query = count_query.where(Task.status == status)
    
    if priority:
        query = query.where(Task.priority == priority)
        count_query = count_query.where(Task.priority == priority)
    
    # Get total count
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0
    
    # Apply ordering and pagination
    query = query.order_by(desc(Task.created_at))
    query = query.offset((page - 1) * per_page).limit(per_page)
    
    result = await db.execute(query)
    tasks = result.scalars().all()
    
    return TaskListResponse(
        tasks=[TaskResponse.model_validate(t) for t in tasks],
        total=total,
        page=page,
        per_page=per_page
    )


@app.get("/api/tasks/{task_id}", response_model=TaskResponse, tags=["Tasks"])
async def get_task(
    task_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Get task details by UUID or Celery task ID."""
    # Try UUID first
    try:
        task_uuid = uuid.UUID(task_id)
        result = await db.execute(select(Task).where(Task.task_id == task_uuid))
        task = result.scalar_one_or_none()
    except ValueError:
        # Try Celery task ID
        result = await db.execute(select(Task).where(Task.celery_task_id == task_id))
        task = result.scalar_one_or_none()
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    return TaskResponse.model_validate(task)


@app.delete("/api/tasks/{task_id}", tags=["Tasks"])
async def delete_task(
    task_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Delete a task by UUID."""
    try:
        task_uuid = uuid.UUID(task_id)
        result = await db.execute(select(Task).where(Task.task_id == task_uuid))
        task = result.scalar_one_or_none()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid task ID")
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Revoke Celery task if pending
    if task.celery_task_id and task.status in [TaskStatus.PENDING, TaskStatus.STARTED]:
        celery_app.control.revoke(task.celery_task_id, terminate=True)
    
    await db.delete(task)
    await db.commit()
    
    return {"message": "Task deleted successfully", "task_id": str(task_uuid)}


@app.post("/api/tasks/submit-failing", response_model=TaskSubmitResponse, status_code=201, tags=["Tasks"])
async def submit_failing_task(
    task_data: TaskCreate,
    db: AsyncSession = Depends(get_db)
):
    """Submit a task that is designed to fail (for testing error handling)."""
    task = Task(
        task_id=uuid.uuid4(),
        name=f"[FAIL TEST] {task_data.name}",
        task_type="failing_task",
        priority=task_data.priority,
        status=TaskStatus.PENDING,
        total_steps=task_data.total_steps,
        progress=0
    )
    
    db.add(task)
    await db.commit()
    await db.refresh(task)
    
    queue_name = get_queue_for_priority(task_data.priority.value)
    
    celery_result = execute_task.apply_async(
        args=[task.id, "failing_task", task_data.total_steps, True],
        queue=queue_name,
        routing_key=queue_name
    )
    
    task.celery_task_id = celery_result.id
    await db.commit()
    
    return TaskSubmitResponse(
        task_id=task.task_id,
        celery_task_id=celery_result.id,
        message="Failing task submitted for testing",
        status=TaskStatus.PENDING
    )


# ============================================================================
# WebSocket Endpoints
# ============================================================================

@app.websocket("/ws")
async def websocket_all_tasks(websocket: WebSocket):
    """WebSocket endpoint for receiving all task updates."""
    await manager.connect(websocket)
    try:
        while True:
            # Keep connection alive and handle any client messages
            data = await websocket.receive_text()
            # Echo back or handle commands
            await websocket.send_json({"type": "ack", "message": data})
    except WebSocketDisconnect:
        manager.disconnect(websocket)


@app.websocket("/ws/{task_id}")
async def websocket_task_progress(websocket: WebSocket, task_id: str):
    """WebSocket endpoint for receiving updates for a specific task."""
    await manager.connect(websocket, task_id)
    try:
        while True:
            data = await websocket.receive_text()
            await manager.send_personal_message({"type": "ack", "message": data}, websocket)
    except WebSocketDisconnect:
        manager.disconnect(websocket, task_id)


# ============================================================================
# Polling endpoint for task updates (alternative to WebSocket)
# ============================================================================

@app.get("/api/tasks/poll/updates", tags=["Tasks"])
async def poll_task_updates(
    since: Optional[datetime] = Query(None, description="Get updates since this timestamp"),
    db: AsyncSession = Depends(get_db)
):
    """Poll for task updates since a given timestamp."""
    query = select(Task)
    
    if since:
        query = query.where(Task.updated_at > since)
    
    query = query.order_by(desc(Task.updated_at)).limit(50)
    
    result = await db.execute(query)
    tasks = result.scalars().all()
    
    return {
        "timestamp": datetime.utcnow().isoformat(),
        "tasks": [t.to_dict() for t in tasks]
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
