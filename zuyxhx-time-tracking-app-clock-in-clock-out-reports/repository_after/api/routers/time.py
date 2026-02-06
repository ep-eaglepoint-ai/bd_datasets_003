"""Time tracking routes."""

from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from ..database import get_db
from ..schemas import TimeEntryResponse, TimeEntryListResponse, ClockInRequest, ClockOutRequest
from ..services import TimeService
from ..utils.dependencies import get_current_user
from ..models import User

router = APIRouter(prefix="/time", tags=["Time Tracking"])


@router.post("/clock-in", response_model=TimeEntryResponse, status_code=status.HTTP_201_CREATED)
def clock_in(
    request: ClockInRequest = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Clock in to start a time entry."""
    service = TimeService(db)
    notes = request.notes if request else None
    entry, error = service.clock_in(current_user.id, notes)
    if error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error)
    return entry


@router.post("/clock-out", response_model=TimeEntryResponse)
def clock_out(
    request: ClockOutRequest = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Clock out to end the active time entry."""
    service = TimeService(db)
    notes = request.notes if request else None
    entry, error = service.clock_out(current_user.id, notes)
    if error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error)
    return entry


@router.get("", response_model=TimeEntryListResponse)
def get_time_entries(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get time entries with optional date filtering."""
    service = TimeService(db)
    entries, total = service.get_entries(current_user.id, start_date, end_date, page, per_page)
    return TimeEntryListResponse(entries=entries, total=total, page=page, per_page=per_page)


@router.get("/status")
def get_status(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Get current clock-in status."""
    service = TimeService(db)
    status = service.get_user_status(current_user.id)
    return {
        "is_clocked_in": status["is_clocked_in"],
        "active_entry": TimeEntryResponse.model_validate(status["active_entry"]) if status["active_entry"] else None
    }
