"""TimeEntry database model."""

from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from ..database import Base


class TimeEntry(Base):
    """Time entry model for tracking clock in/out."""
    
    __tablename__ = "time_entries"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    start_at = Column(DateTime, nullable=False)
    end_at = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                       onupdate=lambda: datetime.now(timezone.utc))
    
    user = relationship("User", back_populates="time_entries")
    
    @property
    def is_active(self) -> bool:
        """Check if entry is currently active (no end time)."""
        return self.end_at is None
    
    @property
    def duration_seconds(self):
        """Calculate duration in seconds."""
        if self.end_at is None:
            return None
        return (self.end_at - self.start_at).total_seconds()
    
    @property
    def duration_hours(self):
        """Calculate duration in hours."""
        if self.duration_seconds is None:
            return None
        return self.duration_seconds / 3600
    
    def __repr__(self):
        return f"<TimeEntry(id={self.id}, user_id={self.user_id}, active={self.is_active})>"
