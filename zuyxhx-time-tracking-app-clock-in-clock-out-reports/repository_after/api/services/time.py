"""Time tracking service."""

from datetime import datetime, timezone, date
from typing import Optional, Tuple, List
from sqlalchemy.orm import Session
from sqlalchemy import and_
from ..models import TimeEntry


class TimeService:
    """Service for time tracking operations."""
    
    def __init__(self, db: Session):
        self.db = db
    
    def get_active_entry(self, user_id: int) -> Optional[TimeEntry]:
        """Get the active (not clocked out) entry for a user."""
        return self.db.query(TimeEntry).filter(
            and_(
                TimeEntry.user_id == user_id,
                TimeEntry.end_at.is_(None)
            )
        ).first()
    
    def clock_in(self, user_id: int, notes: Optional[str] = None) -> Tuple[Optional[TimeEntry], Optional[str]]:
        """Clock in - create a new time entry."""
        active = self.get_active_entry(user_id)
        if active:
            return None, "Already clocked in. Please clock out first."
        
        entry = TimeEntry(
            user_id=user_id,
            start_at=datetime.now(timezone.utc),
            notes=notes
        )
        self.db.add(entry)
        self.db.commit()
        self.db.refresh(entry)
        return entry, None
    
    def clock_out(self, user_id: int, notes: Optional[str] = None) -> Tuple[Optional[TimeEntry], Optional[str]]:
        """Clock out - set end time on active entry."""
        active = self.get_active_entry(user_id)
        if not active:
            return None, "Not clocked in. Please clock in first."
        
        active.end_at = datetime.now(timezone.utc)
        if notes:
            if active.notes:
                active.notes = f"{active.notes}\n{notes}"
            else:
                active.notes = notes
        
        self.db.commit()
        self.db.refresh(active)
        return active, None
    
    def get_entry_by_id(self, entry_id: int, user_id: int) -> Optional[TimeEntry]:
        """Get a specific time entry."""
        return self.db.query(TimeEntry).filter(
            and_(
                TimeEntry.id == entry_id,
                TimeEntry.user_id == user_id
            )
        ).first()
    
    def get_entries(
        self, 
        user_id: int, 
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        page: int = 1,
        per_page: int = 50
    ) -> Tuple[List[TimeEntry], int]:
        """Get time entries with filtering and pagination."""
        query = self.db.query(TimeEntry).filter(TimeEntry.user_id == user_id)
        
        if start_date:
            query = query.filter(TimeEntry.start_at >= datetime.combine(start_date, datetime.min.time()))
        if end_date:
            query = query.filter(TimeEntry.start_at <= datetime.combine(end_date, datetime.max.time()))
        
        total = query.count()
        
        entries = query.order_by(TimeEntry.start_at.desc()).offset(
            (page - 1) * per_page
        ).limit(per_page).all()
        
        return entries, total
    
    def get_user_status(self, user_id: int) -> dict:
        """Get current clock-in status for user."""
        active = self.get_active_entry(user_id)
        return {
            "is_clocked_in": active is not None,
            "active_entry": active
        }
