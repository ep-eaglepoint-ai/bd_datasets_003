"""
TraceStitcher - Distributed trace correlation and clock-skew correction utility.
"""

from dataclasses import dataclass, field
from typing import List, Dict, Optional, Set


class CircularTraceError(Exception):
    """Raised when a circular dependency is detected in the trace graph."""
    pass


@dataclass
class Event:
    """Represents a single trace event."""
    id: str
    parent_id: Optional[str]
    timestamp: int  # milliseconds
    name: str
    duration: int = 0  # milliseconds
    
    # Internal fields for processing
    children: List['Event'] = field(default_factory=list, repr=False)
    drift_applied: int = 0
    original_timestamp: int = field(init=False, repr=False)
    
    def __post_init__(self):
        self.original_timestamp = self.timestamp
    
    @property
    def end_timestamp(self):
        """Calculate end timestamp based on start + duration."""
        return self.timestamp + self.duration


class TraceStitcher:
    """
    Reconstructs hierarchical trace graphs from flat event lists and corrects
    clock skew between distributed systems.
    """
    
    def __init__(self):
        self.events_by_id: Dict[str, Event] = {}
        self.broken_chains: List[Event] = []
    
    def stitch(self, events: List[Event]) -> List[Event]:
        """
        Main entry point. Takes flat list of events and returns root events
        with hierarchical children attached.
        
        Args:
            events: List of Event objects (unsorted)
            
        Returns:
            List of root Event objects with children populated
            
        Raises:
            CircularTraceError: If circular dependencies detected
        """
        if not events:
            return []
        
        # Build graph structure
        self._build_graph(events)
        
        # Detect cycles
        self._detect_cycles()
        
        # Find roots (events with no parent or parent not in dataset)
        roots = self._find_roots()
        
        # Apply clock-skew normalization
        for root in roots:
            self._normalize_skew(root, parent_drift=0)
        
        return roots
    
    def _build_graph(self, events: List[Event]):
        """
        Build internal graph structure from flat event list.
        Creates parent-child relationships.
        """
        # Index all events by ID
        self.events_by_id = {event.id: event for event in events}
        
        # Build parent-child relationships
        for event in events:
            if event.parent_id:
                parent = self.events_by_id.get(event.parent_id)
                if parent:
                    parent.children.append(event)
                else:
                    # Broken chain - parent doesn't exist
                    self.broken_chains.append(event)
    
    def _find_roots(self) -> List[Event]:
        """Find all root events (no parent or parent missing)."""
        roots = []
        for event in self.events_by_id.values():
            # Root if no parent_id or parent not found (broken chain)
            if not event.parent_id or event.parent_id not in self.events_by_id:
                roots.append(event)
        return roots
    
    def _detect_cycles(self):
        """
        Detect circular dependencies using DFS.
        
        Raises:
            CircularTraceError: If a cycle is found
        """
        visited: Set[str] = set()
        rec_stack: Set[str] = set()
        
        def dfs(event_id: str, path: List[str]) -> bool:
            """DFS helper that tracks recursion stack."""
            if event_id in rec_stack:
                # Found a cycle
                cycle_start = path.index(event_id)
                cycle = ' -> '.join(path[cycle_start:] + [event_id])
                raise CircularTraceError(f"Circular dependency detected: {cycle}")
            
            if event_id in visited:
                return False
            
            visited.add(event_id)
            rec_stack.add(event_id)
            path.append(event_id)
            
            event = self.events_by_id.get(event_id)
            if event:
                for child in event.children:
                    dfs(child.id, path.copy())
            
            rec_stack.remove(event_id)
            return False
        
        # Check all events as potential cycle entry points
        for event_id in self.events_by_id:
            if event_id not in visited:
                dfs(event_id, [])
    
    def _normalize_skew(self, event: Event, parent_drift: int):
        """
        Recursively apply clock-skew normalization.
        
        If a child starts before its parent (due to clock skew), calculate
        the drift and apply it to the child and all descendants.
        
        Args:
            event: Current event to process
            parent_drift: Cumulative drift from ancestors
        """
        # Apply any inherited drift from parent first
        if parent_drift > 0:
            event.timestamp += parent_drift
            event.drift_applied += parent_drift
        
        # Process each child
        for child in event.children:
            # First apply parent's cumulative drift to child
            child_after_parent_drift = child.timestamp + parent_drift
            
            # Check if child (after parent drift) starts before parent
            if child_after_parent_drift < event.timestamp:
                # Calculate additional local drift needed
                local_drift = event.timestamp - child_after_parent_drift + 1
                total_child_drift = parent_drift + local_drift
            else:
                # No additional skew, just pass down parent drift
                total_child_drift = parent_drift
            
            # Recursively apply to child
            self._normalize_skew(child, total_child_drift)

