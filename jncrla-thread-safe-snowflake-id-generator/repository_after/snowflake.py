import time
import threading

CUSTOM_EPOCH_MS = 1704067200000


class ClockMovedBackwardsError(Exception):
    pass


class SnowflakeGenerator:
    def __init__(self, machine_id: int = 0):
        if not 0 <= machine_id <= 1023:
            raise ValueError("machine_id must be in 0-1023")
        self.machine_id = machine_id
        self._lock = threading.Lock()
        self._last_timestamp_ms = -1
        self._sequence = 0

    def next_id(self) -> int:
        with self._lock:
            current_ms = int(time.time() * 1000)
            if current_ms < self._last_timestamp_ms:
                raise ClockMovedBackwardsError("Clock moved backwards")
            if current_ms == self._last_timestamp_ms:
                self._sequence += 1
                if self._sequence > 4095:
                    while True:
                        current_ms = int(time.time() * 1000)
                        if current_ms > self._last_timestamp_ms:
                            break
                    self._last_timestamp_ms = current_ms
                    self._sequence = 0
            else:
                self._last_timestamp_ms = current_ms
                self._sequence = 0
            ts = (self._last_timestamp_ms - CUSTOM_EPOCH_MS) & 0x1FFFFFFFFFF
            return (ts << 22) | ((self.machine_id & 0x3FF) << 12) | (self._sequence & 0xFFF)
