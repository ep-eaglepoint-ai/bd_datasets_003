from __future__ import annotations

import time
from dataclasses import dataclass, field
from enum import Enum


class CircuitState(str, Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


@dataclass
class CircuitBreaker:
    failure_threshold: int = 5
    recovery_timeout: float = 30.0
    half_open_max_calls: int = 3

    state: CircuitState = field(default=CircuitState.CLOSED, init=False)
    _failure_count: int = field(default=0, init=False)
    _half_open_calls: int = field(default=0, init=False)
    _half_open_successes: int = field(default=0, init=False)
    _opened_at: float | None = field(default=None, init=False)

    def can_execute(self) -> bool:
        if self.state == CircuitState.CLOSED:
            return True

        now = time.monotonic()
        if self.state == CircuitState.OPEN:
            if self._opened_at is None:
                return False
            if (now - self._opened_at) >= self.recovery_timeout:
                self.state = CircuitState.HALF_OPEN
                self._half_open_calls = 0
                self._half_open_successes = 0
                return True
            return False

        if self.state == CircuitState.HALF_OPEN:
            return self._half_open_calls < self.half_open_max_calls

        return False

    def record_success(self) -> None:
        if self.state == CircuitState.CLOSED:
            self._failure_count = 0
            return

        if self.state == CircuitState.HALF_OPEN:
            self._half_open_successes += 1
            if self._half_open_successes >= self.half_open_max_calls:
                self.reset()

    def record_failure(self) -> None:
        now = time.monotonic()
        if self.state == CircuitState.HALF_OPEN:
            self.state = CircuitState.OPEN
            self._opened_at = now
            self._failure_count = 0
            self._half_open_calls = 0
            self._half_open_successes = 0
            return

        self._failure_count += 1
        if self._failure_count >= self.failure_threshold:
            self.state = CircuitState.OPEN
            self._opened_at = now

    def reset(self) -> None:
        self.state = CircuitState.CLOSED
        self._failure_count = 0
        self._half_open_calls = 0
        self._half_open_successes = 0
        self._opened_at = None

    def _on_half_open_attempt(self) -> None:
        if self.state == CircuitState.HALF_OPEN:
            self._half_open_calls += 1
