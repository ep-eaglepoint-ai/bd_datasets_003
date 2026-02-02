"""
Retry logic with exponential backoff and jitter.

This module implements reliable retry scheduling for webhook deliveries
with the following features:
- Exponential backoff: base_delay * (2 ^ (attempt - 1))
- Random jitter: ±30% of the delay to prevent thundering herd
- Configurable max attempts (default: 5)
"""

import random
from datetime import datetime, timedelta, timezone
from typing import Optional


# Default configuration
DEFAULT_MAX_ATTEMPTS = 5
DEFAULT_BASE_DELAY_SECONDS = 1.0
DEFAULT_JITTER_RANGE = 0.3  # ±30%


def calculate_exponential_delay(
    attempt: int,
    base_delay: float = DEFAULT_BASE_DELAY_SECONDS
) -> float:
    """
    Calculate exponential backoff delay for a given attempt number.
    
    The formula is: base_delay * (2 ^ (attempt - 1))
    This produces the sequence: 1s, 2s, 4s, 8s, 16s for attempts 1-5.
    
    Args:
        attempt: The attempt number (1-indexed).
        base_delay: The base delay in seconds (default: 1).
    
    Returns:
        Delay in seconds for exponential backoff.
    
    Raises:
        ValueError: If attempt is less than 1.
    """
    if attempt < 1:
        raise ValueError("Attempt number must be 1 or greater")
    
    # Exponential backoff: base_delay * (2 ^ (attempt - 1))
    delay = base_delay * (2 ** (attempt - 1))
    return delay


def calculate_jitter(
    delay: float,
    jitter_range: float = DEFAULT_JITTER_RANGE
) -> float:
    """
    Calculate jitter to add to the delay.
    
    Jitter is applied bidirectionally (±) to spread retry attempts
    across a time window, preventing the thundering herd problem.
    
    The formula is: delay + random(-jitter_range * delay, +jitter_range * delay)
    
    Args:
        delay: The base delay in seconds.
        jitter_range: The range of jitter as a fraction (default: 0.3 for ±30%).
    
    Returns:
        Delay with jitter applied.
    """
    # Calculate jitter amount: ±30% of delay
    jitter_amount = delay * jitter_range
    
    # Add random jitter in both directions
    jittered_delay = delay + random.uniform(-jitter_amount, jitter_amount)
    
    # Ensure delay is always positive
    return max(0.0, jittered_delay)


def calculate_retry_delay(
    attempt: int,
    base_delay: float = DEFAULT_BASE_DELAY_SECONDS,
    jitter_range: float = DEFAULT_JITTER_RANGE
) -> float:
    """
    Calculate the full retry delay with exponential backoff and jitter.
    
    Args:
        attempt: The attempt number (1-indexed).
        base_delay: The base delay in seconds (default: 1).
        jitter_range: The range of jitter as a fraction (default: 0.3 for ±30%).
    
    Returns:
        Total delay in seconds with backoff and jitter applied.
    """
    # Calculate exponential backoff
    base_retry_delay = calculate_exponential_delay(attempt, base_delay)
    
    # Apply jitter
    jittered_delay = calculate_jitter(base_retry_delay, jitter_range)
    
    return jittered_delay


def get_next_retry_time(
    attempt: int,
    base_delay: float = DEFAULT_BASE_DELAY_SECONDS,
    jitter_range: float = DEFAULT_JITTER_RANGE,
    now: Optional[datetime] = None
) -> datetime:
    """
    Calculate the next retry timestamp.
    
    Args:
        attempt: The attempt number (1-indexed).
        base_delay: The base delay in seconds (default: 1).
        jitter_range: The range of jitter as a fraction (default: 0.3 for ±30%).
        now: Optional current time (defaults to now in UTC).
    
    Returns:
        datetime for the next retry attempt.
    """
    if now is None:
        now = datetime.now(timezone.utc)
    
    delay_seconds = calculate_retry_delay(attempt, base_delay, jitter_range)
    
    return now + timedelta(seconds=delay_seconds)


def should_retry(
    attempt: int,
    max_attempts: int = DEFAULT_MAX_ATTEMPTS
) -> bool:
    """
    Determine if another retry attempt should be made.
    
    Args:
        attempt: The current attempt number (1-indexed).
        max_attempts: Maximum number of attempts before giving up.
    
    Returns:
        True if another attempt should be made, False otherwise.
    """
    return attempt < max_attempts


def get_retry_schedule(
    max_attempts: int = DEFAULT_MAX_ATTEMPTS,
    base_delay: float = DEFAULT_BASE_DELAY_SECONDS,
    jitter_range: float = DEFAULT_JITTER_RANGE
) -> list:
    """
    Get the full retry schedule for debugging and testing.
    
    Returns a list of tuples: (attempt_number, delay_seconds, timestamp)
    
    Args:
        max_attempts: Maximum number of attempts.
        base_delay: The base delay in seconds.
        jitter_range: The range of jitter as a fraction.
    
    Returns:
        List of retry schedule entries.
    """
    schedule = []
    now = datetime.now(timezone.utc)
    
    for attempt in range(1, max_attempts + 1):
        delay = calculate_retry_delay(attempt, base_delay, jitter_range)
        retry_time = now + timedelta(seconds=sum(
            calculate_retry_delay(i, base_delay, jitter_range) 
            for i in range(1, attempt + 1)
        ))
        schedule.append({
            "attempt": attempt,
            "delay": delay,
            "cumulative_delay": sum(
                calculate_retry_delay(i, base_delay, jitter_range) 
                for i in range(1, attempt + 1)
            ),
            "retry_at": retry_time.isoformat()
        })
    
    return schedule
