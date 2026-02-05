from enum import Enum
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from pathlib import Path
from tinydb import TinyDB, Query
from tinydb.storages import MemoryStorage

from .models import HistoricalEvent, TimeReference


class EventLog:
    """Manages historical events that influence scheduling"""

    def __init__(self, db_path: str = "data/event_log.json"):
        self.db_path = Path(db_path) if db_path != ":memory:" else None

        if db_path == ":memory:":
            # Use in-memory TinyDB storage
            self.db = TinyDB(storage=MemoryStorage)
        else:
            # Ensure parent directory exists
            self.db_path.parent.mkdir(parents=True, exist_ok=True)
            self.db = TinyDB(str(self.db_path))

        self.events = self.db.table("events")

    def _serialize_event(self, event: HistoricalEvent) -> Dict[str, Any]:
        """Return a JSON-serializable dict for TinyDB insertion."""
        data = event.model_dump() if hasattr(event, "model_dump") else event.dict()

        evt = data.get("event_type")
        if isinstance(evt, Enum):
            data["event_type"] = evt.value
        elif evt is not None:
            data["event_type"] = str(evt)

        ts = data.get("timestamp")
        if isinstance(ts, datetime):
            data["timestamp"] = ts.isoformat()
        return data

    def add_event(self, event: HistoricalEvent) -> str:
        """Add a new historical event to the log"""
        serialized = self._serialize_event(event)
        doc_id = self.events.insert(serialized)
        return str(doc_id)

    def get_events_by_type(
        self,
        event_type: TimeReference,
        limit: int = 10,
        since: Optional[datetime] = None,
    ) -> List[HistoricalEvent]:
        """Get events of a specific type, optionally filtered by time"""
        Event = Query()
        # event_type stored as string matching TimeReference.value
        query = Event.event_type == event_type.value

        results = self.events.search(query)

        # Sort by timestamp descending (most recent first)
        results.sort(key=lambda x: x["timestamp"], reverse=True)

        if since:
            results = [
                r for r in results if datetime.fromisoformat(r["timestamp"]) >= since
            ]

        # Convert to HistoricalEvent objects (Pydantic will parse ISO timestamp)
        events = []
        for r in results[:limit]:
            evt = r.get("event_type")
            if isinstance(evt, Enum):
                r["event_type"] = evt.value
            events.append(HistoricalEvent(**r))
        return events

    def get_latest_event(self, event_type: TimeReference) -> Optional[HistoricalEvent]:
        """Get the most recent event of a specific type"""
        events = self.get_events_by_type(event_type, limit=1)
        return events[0] if events else None

    def get_events_in_range(
        self,
        start_time: datetime,
        end_time: datetime,
    ) -> List[HistoricalEvent]:
        """Get all events within a time range"""
        # TinyDB doesn't support datetime comparisons directly, so we filter in Python
        all_events = self.events.all()

        events_in_range = []
        for event_dict in all_events:
            event_time = datetime.fromisoformat(event_dict["timestamp"])
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

        mock_events = [
            HistoricalEvent(
                event_type=TimeReference.LAST_CANCELLATION,
                timestamp=now - timedelta(hours=3),
                metadata={"reason": "participant_unavailable"},
            ),
            HistoricalEvent(
                event_type=TimeReference.LAST_CANCELLATION,
                timestamp=now - timedelta(days=1, hours=2),
                metadata={"reason": "emergency"},
            ),
            HistoricalEvent(
                event_type=TimeReference.LAST_DEPLOYMENT,
                timestamp=now - timedelta(days=2, hours=4),
                metadata={"version": "v2.1.0", "success": True},
            ),
            HistoricalEvent(
                event_type=TimeReference.CRITICAL_INCIDENT,
                timestamp=now - timedelta(hours=12),
                metadata={"severity": "high", "resolved": True},
            ),
            HistoricalEvent(
                event_type=TimeReference.CRITICAL_INCIDENT,
                timestamp=now - timedelta(days=3),
                metadata={"severity": "medium", "resolved": True},
            ),
        ]

        for event in mock_events:
            self.add_event(event)

        print(f"Seeded {len(mock_events)} mock events")

    def close(self):
        """Close the database connection"""
        try:
            self.db.close()
        except Exception:
            pass