from __future__ import annotations

import asyncio
import random
from dataclasses import dataclass
from functools import wraps
from typing import Any, Awaitable, Callable, ParamSpec, Set, TypeVar


P = ParamSpec("P")
T = TypeVar("T")


@dataclass
class RetryConfig:
    max_retries: int = 3
    base_delay: float = 0.5
    max_delay: float = 10.0
    exponential_base: float = 2.0
    jitter: bool = True
    retryable_status_codes: Set[int] = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        if self.retryable_status_codes is None:
            self.retryable_status_codes = {500, 502, 503, 504}

    def calculate_delay(self, attempt: int) -> float:
        # attempt is 1-based for readability
        delay = self.base_delay * (self.exponential_base ** (attempt - 1))
        delay = min(delay, self.max_delay)
        if self.jitter:
            delay = delay * (0.5 + random.random())
        return delay


def with_retry(config: RetryConfig) -> Callable[[Callable[P, Awaitable[T]]], Callable[P, Awaitable[T]]]:
    """Retry decorator for async callables.

    The wrapped function may raise an exception with a `status_code` attribute
    (e.g., APIError) to trigger status-code based retries.
    """

    def decorator(func: Callable[P, Awaitable[T]]) -> Callable[P, Awaitable[T]]:
        @wraps(func)
        async def wrapper(*args: P.args, **kwargs: P.kwargs) -> T:
            last_exc: BaseException | None = None
            for attempt in range(0, config.max_retries + 1):
                try:
                    return await func(*args, **kwargs)
                except Exception as e:
                    last_exc = e
                    status_code = getattr(e, "status_code", None)
                    retryable_status = status_code in config.retryable_status_codes if status_code is not None else False
                    # Avoid importing httpx here; treat network/transient failures by class name.
                    # Typical httpx transport exceptions: ConnectError, ReadError, RemoteProtocolError, WriteError.
                    retryable_network = e.__class__.__name__ in {
                        "TransportError",
                        "ProtocolError",
                        "ConnectError",
                        "ReadError",
                        "WriteError",
                        "RemoteProtocolError",
                        "NetworkError",
                    }
                    retryable_timeout = e.__class__.__name__ in {"TimeoutError", "ReadTimeout", "ConnectTimeout", "TimeoutException"}
                    retryable = retryable_status or retryable_network or retryable_timeout

                    if attempt >= config.max_retries or not retryable:
                        raise

                    await asyncio.sleep(config.calculate_delay(attempt + 1))

            raise last_exc or RuntimeError("retry failed")

        return wrapper

    return decorator
