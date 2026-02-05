from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class RateLimiter:
    requests_per_second: float
    burst_size: int

    _tokens: float = field(init=False)
    _last: float = field(init=False)
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    def __post_init__(self) -> None:
        self._tokens = float(self.burst_size)
        self._last = time.monotonic()

    async def acquire(self) -> None:
        async with self._lock:
            now = time.monotonic()
            elapsed = now - self._last
            self._last = now

            self._tokens = min(float(self.burst_size), self._tokens + elapsed * self.requests_per_second)
            if self._tokens >= 1.0:
                self._tokens -= 1.0
                return

            # Need to wait for enough tokens
            missing = 1.0 - self._tokens
            wait = missing / self.requests_per_second if self.requests_per_second > 0 else 0.0
            self._tokens = 0.0

        if wait > 0:
            await asyncio.sleep(wait)

    @staticmethod
    def parse_retry_after(value: Optional[str]) -> Optional[int]:
        if value is None:
            return None
        try:
            seconds = int(value)
            return seconds if seconds >= 0 else None
        except Exception:
            return None
