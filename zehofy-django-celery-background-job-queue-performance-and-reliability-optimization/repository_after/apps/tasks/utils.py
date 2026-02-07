"""
Shared utilities for Celery tasks: idempotency, rate limiting, and progress tracking.
"""
import hashlib
import json
import time
import redis
import os
from functools import wraps
from typing import Optional, Dict, Any
from django.core.cache import cache


# Redis client for rate limiting and idempotency
_redis_client = None

def get_redis_client():
    """Get or create Redis client."""
    global _redis_client
    if _redis_client is None:
        redis_url = os.environ.get('REDIS_URL', 'redis://localhost:6379/0')
        _redis_client = redis.from_url(redis_url, decode_responses=True)
    return _redis_client


# =============================================================================
# IDEMPOTENCY - Prevent duplicate task execution
# =============================================================================

def generate_idempotency_key(task_name: str, args: tuple, kwargs: dict) -> str:
    """
    Generate a deterministic idempotency key from task name and arguments.
    
    Args:
        task_name: Name of the task
        args: Positional arguments tuple
        kwargs: Keyword arguments dict
        
    Returns:
        MD5 hash key string
    """
    # Normalize arguments for consistent hashing
    args_dict = {
        'task': task_name,
        'args': args,
        'kwargs': kwargs
    }
    # Create deterministic string representation
    normalized = json.dumps(args_dict, sort_keys=True, default=str)
    # Generate hash
    return hashlib.md5(normalized.encode()).hexdigest()


def check_idempotency(key: str, ttl: int = 86400) -> tuple[bool, Optional[Any]]:
    """
    Check if task with this idempotency key has already completed.
    
    Args:
        key: Idempotency key
        ttl: Time to live in seconds (default 24 hours)
        
    Returns:
        Tuple of (already_completed, cached_result)
    """
    redis_client = get_redis_client()
    cache_key = f"idempotency:{key}"
    
    cached = redis_client.get(cache_key)
    if cached:
        return True, json.loads(cached)
    
    # Mark as in-progress to prevent concurrent execution
    redis_client.setex(cache_key, 10, json.dumps({'status': 'in_progress'}))
    return False, None


def mark_idempotency_complete(key: str, result: Any, ttl: int = 86400) -> None:
    """
    Mark idempotency key as completed with result.
    
    Args:
        key: Idempotency key
        result: Task result to cache
        ttl: Time to live in seconds
    """
    redis_client = get_redis_client()
    cache_key = f"idempotency:{key}"
    redis_client.setex(cache_key, ttl, json.dumps({
        'status': 'completed',
        'result': result
    }, default=str))


# =============================================================================
# RATE LIMITING - Token bucket algorithm for external API calls
# =============================================================================

class TokenBucketRateLimiter:
    """
    Token bucket rate limiter for controlling API call rates.
    
    Attributes:
        rate: Tokens added per second
        capacity: Maximum tokens in bucket
        redis_prefix: Prefix for Redis keys
    """
    
    def __init__(self, rate: float, capacity: int, redis_prefix: str = 'rate_limit'):
        self.rate = rate  # tokens per second
        self.capacity = capacity
        self.redis_prefix = redis_prefix
        self.redis = get_redis_client()
    
    def _get_key(self, identifier: str) -> str:
        """Get Redis key for identifier."""
        return f"{self.redis_prefix}:{identifier}"
    
    def consume(self, identifier: str, tokens: int = 1) -> tuple[bool, float]:
        """
        Consume tokens from bucket.
        
        Args:
            identifier: Unique identifier (e.g., API endpoint, user ID)
            tokens: Number of tokens to consume
            
        Returns:
            Tuple of (allowed, wait_time_seconds)
        """
        key = self._get_key(identifier)
        now = time.time()
        
        # Use Redis pipeline for atomic operations
        pipe = self.redis.pipeline()
        
        # Get current state
        pipe.get(f"{key}:tokens")
        pipe.get(f"{key}:last_update")
        
        results = pipe.execute()
        
        current_tokens = float(results[0]) if results[0] else self.capacity
        last_update = float(results[1]) if results[1] else now
        
        # Calculate tokens to add based on elapsed time
        elapsed = now - last_update
        tokens_to_add = elapsed * self.rate
        new_tokens = min(self.capacity, current_tokens + tokens_to_add)
        
        # Check if we can consume
        if new_tokens >= tokens:
            new_tokens -= tokens
            allowed = True
            wait_time = 0
        else:
            allowed = False
            # Calculate wait time to get enough tokens
            tokens_needed = tokens - new_tokens
            wait_time = tokens_needed / self.rate if self.rate > 0 else float('inf')
        
        # Update Redis
        pipe = self.redis.pipeline()
        pipe.setex(f"{key}:tokens", 86400, str(new_tokens))  # 24h TTL
        pipe.setex(f"{key}:last_update", 86400, str(now))
        pipe.execute()
        
        return allowed, wait_time
    
    def get_remaining(self, identifier: str) -> int:
        """Get remaining tokens for identifier."""
        key = self._get_key(identifier)
        now = time.time()
        
        pipe = self.redis.pipeline()
        pipe.get(f"{key}:tokens")
        pipe.get(f"{key}:last_update")
        results = pipe.execute()
        
        current_tokens = float(results[0]) if results[0] else self.capacity
        last_update = float(results[1]) if results[1] else now
        
        elapsed = now - last_update
        tokens_to_add = elapsed * self.rate
        return int(min(self.capacity, current_tokens + tokens_to_add))


# Global rate limiter for push notifications (100 requests per minute)
PUSH_NOTIFICATION_LIMITER = TokenBucketRateLimiter(
    rate=100/60,  # ~1.67 tokens per second
    capacity=100,
    redis_prefix='push_api'
)

# Rate limiter for email sending (50 emails per minute)
EMAIL_RATE_LIMITER = TokenBucketRateLimiter(
    rate=50/60,  # ~0.83 tokens per second
    capacity=50,
    redis_prefix='email_api'
)


# =============================================================================
# PROGRESS TRACKING - Queryable task progress
# =============================================================================

class ProgressTracker:
    """
    Track task progress with current step, total steps, and status.
    
    Progress is stored in Redis for queryability.
    """
    
    def __init__(self, task_id: str, total_steps: int = 100):
        """
        Initialize progress tracker.
        
        Args:
            task_id: Unique task identifier
            total_steps: Total number of steps (default 100)
        """
        self.task_id = task_id
        self.total_steps = total_steps
        self.redis = get_redis_client()
        self.prefix = 'task_progress'
    
    def _get_key(self) -> str:
        """Get Redis key for progress."""
        return f"{self.prefix}:{self.task_id}"
    
    def start(self, initial_step: int = 0, status: str = 'running') -> None:
        """Start tracking progress."""
        self.redis.hset(self._get_key(), mapping={
            'current': initial_step,
            'total': self.total_steps,
            'status': status,
            'message': 'Task started',
            'started_at': time.time()
        })
        self.redis.expire(self._get_key(), 86400)  # 24 hour TTL
    
    def update(self, current: int, message: str = '') -> float:
        """
        Update current progress.
        
        Args:
            current: Current step number
            message: Optional status message
            
        Returns:
            Progress percentage (0.0 to 1.0)
        """
        percentage = min(1.0, current / self.total_steps) if self.total_steps > 0 else 1.0
        
        self.redis.hset(self._get_key(), mapping={
            'current': current,
            'percentage': round(percentage * 100, 2),
            'message': message
        })
        
        return percentage
    
    def increment(self, amount: int = 1, message: str = '') -> float:
        """Increment progress by amount."""
        current = self.redis.hget(self._get_key(), 'current')
        current = int(current) if current else 0
        return self.update(current + amount, message)
    
    def complete(self, result: Any = None, message: str = 'completed') -> None:
        """
        Mark task as completed.
        
        Args:
            result: Final result to store
            message: Completion message
        """
        self.redis.hset(self._get_key(), mapping={
            'current': self.total_steps,
            'percentage': 100.0,
            'status': 'completed',
            'message': message,
            'result': json.dumps(result, default=str) if result else None,
            'completed_at': time.time()
        })
    
    def fail(self, error: str = '') -> None:
        """Mark task as failed."""
        self.redis.hset(self._get_key(), mapping={
            'status': 'failed',
            'message': 'Task failed',
            'error': error,
            'failed_at': time.time()
        })
    
    def get_status(self) -> Dict[str, Any]:
        """Get current status."""
        data = self.redis.hgetall(self._get_key())
        if not data:
            return {'status': 'not_found', 'task_id': self.task_id}
        
        # Convert types
        if 'current' in data:
            data['current'] = int(data['current'])
        if 'total' in data:
            data['total'] = int(data['total'])
        if 'percentage' in data:
            data['percentage'] = float(data['percentage'])
        
        data['task_id'] = self.task_id
        return data
    
    @property
    def percentage(self) -> float:
        """Get current percentage."""
        data = self.redis.hget(self._get_key(), 'percentage')
        return float(data) if data else 0.0
    
    @property
    def is_complete(self) -> bool:
        """Check if task is complete."""
        return self.redis.hget(self._get_key(), 'status') == 'completed'
    
    @property
    def is_failed(self) -> bool:
        """Check if task failed."""
        return self.redis.hget(self._get_key(), 'status') == 'failed'


def track_progress(task_id: str, total_steps: int = 100):
    """
    Decorator for automatic progress tracking.
    
    Args:
        task_id: Task identifier (can be a string or callable)
        total_steps: Total steps for the task
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Generate task_id if callable
            actual_task_id = task_id(*args, **kwargs) if callable(task_id) else task_id
            
            # Try to get progress_tracker from kwargs, or create new one
            tracker = kwargs.get('progress_tracker')
            if tracker is None:
                tracker = ProgressTracker(actual_task_id, total_steps)
            
            try:
                # Update kwargs with tracker
                kwargs['progress_tracker'] = tracker
                result = func(*args, **kwargs)
                return result
            except Exception as e:
                tracker.fail(str(e))
                raise
        
        return wrapper
    return decorator
