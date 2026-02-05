import json
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from pathlib import Path
from tinydb import TinyDB, Query
from tinydb.table import Document

from .models import HistoricalEvent, TimeReference


class EventLog:
    """Manages historical events that influence scheduling"""
    
    def __init__(self, db_path: str = "data/event_log.json"):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(exist_ok=True)
        self.db = TinyDB(self.db_path)
        self.events = self.db.table('events')
        
    def add_event(self, event: HistoricalEvent) -> str:
        """Add a new historical event to the log"""
        # Convert to dict using model_dump for Pydantic v2 compatibility
        event_dict = event.model_dump() if hasattr(event, 'model_dump') else event.dict()
        doc_id = self.events.insert(event_dict)
        return str(doc_id)
    
    def get_events_by_type(
        self, 
        event_type: TimeReference, 
        limit: int = 10,
        since: Optional[datetime] = None
    ) -> List[HistoricalEvent]:
        """Get events of a specific type, optionally filtered by time"""
        Event = Query()
        query = Event.event_type == event_type.value
        
        results = self.events.search(query)
        
        # Sort by timestamp descending (most recent first)
        results.sort(key=lambda x: x['timestamp'], reverse=True)
        
        if since:
            results = [r for r in results if datetime.fromisoformat(r['timestamp']) >= since]
        
        # Convert to HistoricalEvent objects
        events = [HistoricalEvent(**r) for r in results[:limit]]
        return events
    
    def get_latest_event(self, event_type: TimeReference) -> Optional[HistoricalEvent]:
        """Get the most recent event of a specific type"""
        events = self.get_events_by_type(event_type, limit=1)
        return events[0] if events else None
    
    def get_events_in_range(
        self, 
        start_time: datetime, 
        end_time: datetime
    ) -> List[HistoricalEvent]:
        """Get all events within a time range"""
        Event = Query()
        
        # TinyDB doesn't support datetime comparisons directly, so we filter in Python
        all_events = self.events.all()
        
        events_in_range = []
        for event_dict in all_events:
            event_time = datetime.fromisoformat(event_dict['timestamp'])
            if start_time <= event_time <= end_time:
                events_in_range.append(HistoricalEvent(**event_dict))
        
        return sorted(events_in_range, key=lambda x: x.timestamp)
    
    def clear_events(self, event_type: Optional[TimeReference] = None):
        """Clear events, optionally filtered by type"""
        if event_type:
            Event = Query()
            self.events.remove(Event.event_type == event_type.value)
        else:
            self.events.truncate()
    
    def seed_mock_data(self):
        """Seed the database with mock historical events for testing"""
        now = datetime.now()
        
        # Clear existing events first
        self.clear_events()
        
        # Add workload event (important for lunch calculations)
        from .models import HistoricalEvent, TimeReference
        
        workload_event = HistoricalEvent(
            event_type=TimeReference.PREVIOUS_DAY_WORKLOAD,
            timestamp=now - timedelta(days=1),
            metadata={"source": "mock_data", "workload": 75},
            calculated_value=75.0
        )
        self.add_event(workload_event)
        
        # Add other events
        mock_events = [
            HistoricalEvent(
                event_type=TimeReference.LAST_CANCELLATION,
                timestamp=now - timedelta(hours=3),
                metadata={"reason": "participant_unavailable"}
            ),
            HistoricalEvent(
                event_type=TimeReference.LAST_CANCELLATION,
                timestamp=now - timedelta(days=1, hours=2),
                metadata={"reason": "emergency"}
            ),
            HistoricalEvent(
                event_type=TimeReference.LAST_DEPLOYMENT,
                timestamp=now - timedelta(days=2, hours=4),
                metadata={"version": "v2.1.0", "success": True}
            ),
            HistoricalEvent(
                event_type=TimeReference.CRITICAL_INCIDENT,
                timestamp=now - timedelta(hours=18),
                metadata={"severity": "high", "resolved": True}
            ),
        ]
        
        for event in mock_events:
            self.add_event(event)
        
        return f"Seeded {len(mock_events) + 1} mock events"
    
    def close(self):
        """Close the database connection"""
        self.db.close()