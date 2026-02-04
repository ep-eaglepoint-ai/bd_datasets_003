import asyncio
import functools
import time
from typing import Callable, Tuple, Type, Union, Optional

class RetryError(Exception):
    """Exception raised when all retry attempts fail."""
    def __init__(self, attempts: int, cause: Exception):
        self.attempts = attempts
        self.cause = cause
        super().__init__(f"Retry failed after {attempts} attempts. Original error: {cause}")

def retry(
    max_attempts: int = 3,
    delay: float = 1.0,
    backoff: str = "fixed",
    exceptions: Tuple[Type[Exception], ...] = (Exception,)
) -> Callable:
    """
    Decorator to retry a function call upon failure.
    
    Args:
        max_attempts: Maximum number of attempts before raising RetryError. Default 3.
        delay: Base delay in seconds between attempts. Default 1.0.
        backoff: Backoff strategy ("fixed", "linear", "exponential"). Default "fixed".
        exceptions: Tuple of exception types to catch and retry on. Default (Exception,).
        
    Returns:
        Decorated function.
        
    Raises:
        ValueError: If configuration parameters are invalid.
    """
    if max_attempts <= 0:
        raise ValueError("max_attempts must be greater than 0")
    if delay < 0:
        raise ValueError("delay must be non-negative")
    if backoff not in ("fixed", "linear", "exponential"):
        raise ValueError("backoff must be one of 'fixed', 'linear', 'exponential'")

    def decorator(func: Callable) -> Callable:
        
        def calculate_delay(attempt: int) -> float:
            if backoff == "fixed":
                return delay
            elif backoff == "linear":
                return delay * attempt
            else:  # exponential
                return delay * (2 ** (attempt - 1))

        if asyncio.iscoroutinefunction(func):
            @functools.wraps(func)
            async def async_wrapper(*args, **kwargs):
                last_exception = None
                for attempt in range(1, max_attempts + 1):
                    try:
                        return await func(*args, **kwargs)
                    except exceptions as e:
                        last_exception = e
                        if attempt == max_attempts:
                            raise RetryError(max_attempts, last_exception)
                        
                        sleep_time = calculate_delay(attempt)
                        # Optional: Log retry attempt
                        # print(f"Attempt {attempt} failed: {e}. Retrying in {sleep_time}s...")
                        await asyncio.sleep(sleep_time) 

            return async_wrapper
        
        else:
            @functools.wraps(func)
            def sync_wrapper(*args, **kwargs):
                last_exception = None
                for attempt in range(1, max_attempts + 1):
                    try:
                        return func(*args, **kwargs)
                    except exceptions as e:
                        last_exception = e
                        if attempt == max_attempts:
                            raise RetryError(max_attempts, last_exception)
                        
                        sleep_time = calculate_delay(attempt)
                        # Optional: Log retry attempt
                        # print(f"Attempt {attempt} failed: {e}. Retrying in {sleep_time}s...")
                        time.sleep(sleep_time)

            return sync_wrapper

    return decorator
