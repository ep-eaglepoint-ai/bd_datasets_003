"""Reports service."""

import csv
import io
from datetime import date, timedelta, datetime
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_
from ..models import TimeEntry
from ..schemas import DailySummary, WeeklySummary, ReportSummaryResponse


class ReportsService:
    """Service for generating reports."""
    
    def __init__(self, db: Session):
        self.db = db
    
    def get_completed_entries(
        self, 
        user_id: int, 
        start_date: date, 
        end_date: date
    ) -> List[TimeEntry]:
        """Get completed entries within date range."""
        return self.db.query(TimeEntry).filter(
            and_(
                TimeEntry.user_id == user_id,
                TimeEntry.end_at.isnot(None),
                TimeEntry.start_at >= datetime.combine(start_date, datetime.min.time()),
                TimeEntry.start_at <= datetime.combine(end_date, datetime.max.time())
            )
        ).order_by(TimeEntry.start_at).all()
    
    def get_daily_summaries(
        self, 
        user_id: int, 
        start_date: date, 
        end_date: date
    ) -> List[DailySummary]:
        """Generate daily summaries."""
        entries = self.get_completed_entries(user_id, start_date, end_date)
        
        daily_data = {}
        current = start_date
        while current <= end_date:
            daily_data[current] = {"total_hours": 0.0, "entry_count": 0}
            current += timedelta(days=1)
        
        for entry in entries:
            entry_date = entry.start_at.date()
            if entry_date in daily_data and entry.duration_hours:
                daily_data[entry_date]["total_hours"] += entry.duration_hours
                daily_data[entry_date]["entry_count"] += 1
        
        return [
            DailySummary(
                date=d,
                total_hours=round(data["total_hours"], 2),
                entry_count=data["entry_count"]
            )
            for d, data in sorted(daily_data.items())
        ]
    
    def get_weekly_summaries(
        self, 
        user_id: int, 
        start_date: date, 
        end_date: date
    ) -> List[WeeklySummary]:
        """Generate weekly summaries."""
        daily = self.get_daily_summaries(user_id, start_date, end_date)
        
        weeks = {}
        for day in daily:
            week_start = day.date - timedelta(days=day.date.weekday())
            week_end = week_start + timedelta(days=6)
            
            if week_start not in weeks:
                weeks[week_start] = {
                    "week_end": week_end,
                    "total_hours": 0.0,
                    "entry_count": 0,
                    "daily_breakdown": []
                }
            
            weeks[week_start]["total_hours"] += day.total_hours
            weeks[week_start]["entry_count"] += day.entry_count
            weeks[week_start]["daily_breakdown"].append(day)
        
        return [
            WeeklySummary(
                week_start=ws,
                week_end=data["week_end"],
                total_hours=round(data["total_hours"], 2),
                entry_count=data["entry_count"],
                daily_breakdown=data["daily_breakdown"]
            )
            for ws, data in sorted(weeks.items())
        ]
    
    def get_summary(
        self, 
        user_id: int, 
        start_date: Optional[date] = None, 
        end_date: Optional[date] = None
    ) -> ReportSummaryResponse:
        """Get full report summary."""
        if end_date is None:
            end_date = date.today()
        if start_date is None:
            start_date = end_date - timedelta(days=30)
        
        daily = self.get_daily_summaries(user_id, start_date, end_date)
        weekly = self.get_weekly_summaries(user_id, start_date, end_date)
        
        total_hours = sum(d.total_hours for d in daily)
        total_entries = sum(d.entry_count for d in daily)
        
        return ReportSummaryResponse(
            start_date=start_date,
            end_date=end_date,
            total_hours=round(total_hours, 2),
            total_entries=total_entries,
            daily_summaries=daily,
            weekly_summaries=weekly
        )
    
    def generate_csv(
        self, 
        user_id: int, 
        start_date: Optional[date] = None, 
        end_date: Optional[date] = None
    ) -> str:
        """Generate CSV export of time entries."""
        if end_date is None:
            end_date = date.today()
        if start_date is None:
            start_date = end_date - timedelta(days=30)
        
        entries = self.get_completed_entries(user_id, start_date, end_date)
        
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Entry ID", "Date", "Start Time", "End Time", "Duration (hours)", "Notes"])
        
        for entry in entries:
            writer.writerow([
                entry.id,
                entry.start_at.date().isoformat(),
                entry.start_at.strftime("%H:%M:%S"),
                entry.end_at.strftime("%H:%M:%S") if entry.end_at else "",
                f"{entry.duration_hours:.2f}" if entry.duration_hours else "",
                entry.notes or ""
            ])
        
        return output.getvalue()
