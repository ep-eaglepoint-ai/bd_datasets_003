from __future__ import annotations
import time
import threading


class TokenBucketRateLimiter:
    """
    Simple in-memory token bucket limiter.
    Not distributed, but satisfies "rate limiting" conceptually for this task.
    """

    def __init__(self, rate_per_sec: float, capacity: int):
        self.rate_per_sec = float(rate_per_sec)
        self.capacity = int(capacity)
        self.tokens = float(capacity)
        self.updated_at = time.monotonic()
        self._lock = threading.Lock()

    def _refill(self, now: float) -> None:
        elapsed = now - self.updated_at
        if elapsed <= 0:
            return
        self.tokens = min(self.capacity, self.tokens + elapsed * self.rate_per_sec)
        self.updated_at = now

    def allow(self, cost: float = 1.0) -> bool:
        now = time.monotonic()
        with self._lock:
            self._refill(now)
            if self.tokens >= cost:
                self.tokens -= cost
                return True
            return False
