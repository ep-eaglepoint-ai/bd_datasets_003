# exposed interfaces
class LogEntry:
    def __init__(self, source: str, severity: str, message: str, timestamp: float):
        ...

class Aggregator:
    def submit(self, entry: LogEntry) -> None:
        """Accepts a log entry for aggregation."""

    def start(self) -> None:
        """Starts background flushing."""

    def stop(self) -> None:
        """Stops the system and flushes remaining entries."""
