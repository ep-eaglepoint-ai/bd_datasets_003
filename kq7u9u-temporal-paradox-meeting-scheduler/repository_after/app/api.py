from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from datetime import datetime
from typing import Dict, Any

from .models import ScheduleRequest, ScheduleResponse, ErrorResponse
from .scheduler import TemporalScheduler
from .event_log import EventLog

# Create a singleton event log for the app lifecycle and ensure it starts empty.
# This prevents tests from seeing previously-seeded persistent data.
EVENT_LOG = EventLog()  # default path "data/event_log.json"
EVENT_LOG.clear_events()


def get_event_log() -> EventLog:
    """Dependency to get event log instance"""
    return EVENT_LOG


def get_scheduler(event_log: EventLog = Depends(get_event_log)) -> TemporalScheduler:
    """Dependency to get scheduler instance"""
    return TemporalScheduler(event_log)


def create_app() -> FastAPI:
    """Create and configure FastAPI application"""
    app = FastAPI(
        title="ChronoLabs Temporal Paradox Meeting Scheduler",
        description="API for scheduling meetings with complex temporal dependencies",
        version="1.0.0"
    )

    # Add CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # In production, specify actual origins
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        raw_errors = exc.errors() if hasattr(exc, "errors") else []
        errors = []
        for err in raw_errors:
            err = dict(err)
            ctx = err.get("ctx")
            if isinstance(ctx, dict) and "error" in ctx:
                ctx = dict(ctx)
                ctx["error"] = str(ctx["error"])
                err["ctx"] = ctx
            errors.append(err)
        # Return 400 only for explicit participant validation errors; otherwise keep 422.
        for err in errors:
            loc = err.get("loc", [])
            if len(loc) >= 2 and loc[0] == "body" and loc[1] == "participants":
                return JSONResponse(status_code=400, content={"detail": errors})
        return JSONResponse(status_code=422, content={"detail": errors})

    @app.get("/")
    async def root() -> Dict[str, str]:
        """Root endpoint"""
        return {
            "service": "ChronoLabs Temporal Paradox Meeting Scheduler",
            "version": "1.0.0",
            "status": "operational"
        }

    @app.get("/health")
    async def health_check() -> Dict[str, str]:
        """Health check endpoint"""
        return {"status": "healthy", "timestamp": datetime.now().isoformat()}

    @app.get("/events")
    async def get_events(
        event_type: str = None,
        limit: int = 10,
        event_log: EventLog = Depends(get_event_log)
    ) -> Dict[str, Any]:
        """Get historical events"""
        from .models import TimeReference

        if event_type:
            try:
                ref = TimeReference(event_type)
                events = event_log.get_events_by_type(ref, limit=limit)
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Invalid event type: {event_type}")
        else:
            # Get all events
            events = []
            for ref in TimeReference:
                type_events = event_log.get_events_by_type(ref, limit=limit)
                events.extend(type_events)

        # Use model_dump() if available to serialize Pydantic models (v2)
        serialized = []
        for event in events:
            if hasattr(event, "model_dump"):
                serialized.append(event.model_dump())
            else:
                serialized.append(event.dict())

        return {
            "count": len(events),
            "events": serialized
        }

    @app.post("/schedule", response_model=ScheduleResponse, responses={400: {"model": ErrorResponse}})
    async def schedule_meeting(
        request: ScheduleRequest,
        scheduler: TemporalScheduler = Depends(get_scheduler)
    ) -> ScheduleResponse:
        """Schedule a meeting with complex temporal rules"""

        # Validate request (guard in addition to Pydantic)
        if request.duration_minutes <= 0:
            raise HTTPException(
                status_code=400,
                detail="Duration must be positive"
            )

        if len(request.participants) == 0:
            raise HTTPException(
                status_code=400,
                detail="At least one participant is required"
            )

        # Schedule the meeting
        response, error = await scheduler.schedule_meeting(request)

        if error:
            # Use model_dump() for Pydantic v2 compatibility
            detail = error.model_dump() if hasattr(error, "model_dump") else error.dict()
            raise HTTPException(
                status_code=400,
                detail=detail
            )

        return response

    @app.post("/schedule/validate")
    async def validate_rule(
        rule: str,
        scheduler: TemporalScheduler = Depends(get_scheduler)
    ) -> Dict[str, Any]:
        """Validate a temporal rule without scheduling"""
        from .parser import TemporalParser
        from .paradox_detector import TemporalParadoxDetector
        from .parser import RuleValidator

        parser = TemporalParser()
        paradox_detector = TemporalParadoxDetector(scheduler.event_log)

        try:
            expression = parser.parse(rule)

            # Check for circular dependencies
            circular_ok = RuleValidator.validate_no_circular_references(expression)

            # Detect paradoxes
            paradoxes = paradox_detector.detect_paradoxes(expression)

            return {
                "valid": True,
                "expression": str(expression.model_dump()) if hasattr(expression, "model_dump") else str(expression.dict()),
                "circular_dependency_check": circular_ok,
                "paradox_count": len(paradoxes),
                "paradoxes": [p["description"] for p in paradoxes],
                "is_schedulable": len(paradoxes) == 0 and circular_ok
            }
        except Exception as e:
            return {
                "valid": False,
                "error": str(e),
                "expression": None,
                "circular_dependency_check": False,
                "paradox_count": 0,
                "paradoxes": [],
                "is_schedulable": False
            }

    @app.post("/events/seed")
    async def seed_events(event_log: EventLog = Depends(get_event_log)) -> Dict[str, Any]:
        """Seed the event log with mock data"""
        event_log.seed_mock_data()
        return {"status": "seeded", "message": "Mock events added to event log"}

    @app.delete("/events")
    async def clear_events(
        event_type: str = None,
        event_log: EventLog = Depends(get_event_log)
    ) -> Dict[str, str]:
        """Clear events from the event log"""
        from .models import TimeReference

        if event_type:
            try:
                ref = TimeReference(event_type)
                event_log.clear_events(ref)
                return {"status": "cleared", "event_type": event_type}
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Invalid event type: {event_type}")
        else:
            event_log.clear_events()
            return {"status": "cleared", "message": "All events cleared"}

    return app