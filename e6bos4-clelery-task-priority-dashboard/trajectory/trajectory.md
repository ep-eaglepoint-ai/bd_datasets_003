# Trajectory - Distributed Task Priority Dashboard (Celery)

## Analysis

The task required building a complete distributed task management system from scratch (0-1 generation). Key requirements included:

1. **Priority-based queuing** - Three queues (High, Medium, Low) with workers consuming in order
2. **Real-time updates** - WebSocket/polling for live progress tracking
3. **PostgreSQL persistence** - Task state and history stored in database
4. **Error handling** - Automatic retries with exponential backoff
5. **React dashboard** - Modern UI displaying task status and progress

## Strategy

Chose a microservices architecture with Docker Compose orchestration:

- **Backend separation** - FastAPI for REST/WebSocket, Celery for task execution
- **Queue configuration** - Workers started with `-Q high,medium,low` consume in priority order
- **State synchronization** - Workers update PostgreSQL directly for persistence
- **Frontend design** - React with glassmorphism UI for modern aesthetics

## Execution

### Phase 1: Backend Implementation
- Created FastAPI app with CORS, WebSocket, and REST endpoints
- Configured Celery with three priority queues using Kombu
- Implemented SQLAlchemy models with status/priority enums
- Added custom ProgressTask base class for granular progress updates

### Phase 2: Celery Tasks
- Implemented `execute_task` with `autoretry_for`, `retry_backoff`, and `max_retries`
- Created task simulations (data_export, pdf_generation, report_generation)
- Added progress update mechanism using `update_state()` and database writes

### Phase 3: Frontend Implementation
- Set up React + Vite with modern CSS design system
- Created Dashboard, TaskList, TaskForm, and ProgressBar components
- Implemented WebSocket client with polling fallback
- Added FAILURE state display with error message rendering

### Phase 4: Docker Infrastructure
- Created multi-service docker-compose.yml
- Configured service dependencies and health checks
- Set up nginx for frontend with API/WebSocket proxying

### Phase 5: Testing
- Wrote test_priority_queue.py simulating 10 Low + 1 High scenario
- Wrote test_failure_display.py for error message capture
- Created evaluation.py following ByteDance standards

## Resources

- [Celery Priority Queues](https://docs.celeryq.dev/en/stable/userguide/routing.html)
- [FastAPI WebSockets](https://fastapi.tiangolo.com/advanced/websockets/)
- [SQLAlchemy Async](https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html)
- [React State Management](https://react.dev/learn/managing-state)

## Key Decisions

1. **Worker prefetch multiplier = 1** - Ensures single-task consumption for strict priority ordering
2. **Polling fallback** - WebSocket may not work in all environments, polling provides reliability
3. **Direct DB updates from workers** - Avoids message passing overhead for progress updates
4. **Exponential backoff** - `retry_backoff=True` with max 60s delay for transient failures
