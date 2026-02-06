"""Time entry Pydantic schemas."""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


class TimeEntryCreate(BaseModel):
    """Schema for creating a time entry."""
    start_at: datetime
    end_at: Optional[datetime] = None
    notes: Optional[str] = Field(None, max_length=1000)


class TimeEntryUpdate(BaseModel):
    """Schema for updating a time entry."""
    end_at: Optional[datetime] = None
    notes: Optional[str] = Field(None, max_length=1000)


class ClockInRequest(BaseModel):
    """Schema for clock in request."""
    notes: Optional[str] = Field(None, max_length=1000)


class ClockOutRequest(BaseModel):
    """Schema for clock out request."""
    notes: Optional[str] = Field(None, max_length=1000)


class TimeEntryResponse(BaseModel):
    """Schema for time entry response."""
    id: int
    user_id: int
    start_at: datetime
    end_at: Optional[datetime]
    notes: Optional[str]
    is_active: bool
    duration_seconds: Optional[float]
    duration_hours: Optional[float]
    created_at: datetime
    
    class Config:
        from_attributes = True


class TimeEntryListResponse(BaseModel):
    """Schema for paginated time entry list."""
    entries: List[TimeEntryResponse]
    total: int
    page: int
    per_page: int
