"""Report-related Pydantic schemas."""

from datetime import date
from typing import Optional, List
from pydantic import BaseModel


class DateRangeFilter(BaseModel):
    """Schema for date range filtering."""
    start_date: Optional[date] = None
    end_date: Optional[date] = None


class DailySummary(BaseModel):
    """Schema for daily summary."""
    date: date
    total_hours: float
    entry_count: int


class WeeklySummary(BaseModel):
    """Schema for weekly summary."""
    week_start: date
    week_end: date
    total_hours: float
    entry_count: int
    daily_breakdown: List[DailySummary]


class ReportSummaryResponse(BaseModel):
    """Schema for report summary response."""
    start_date: date
    end_date: date
    total_hours: float
    total_entries: int
    daily_summaries: List[DailySummary]
    weekly_summaries: List[WeeklySummary]
