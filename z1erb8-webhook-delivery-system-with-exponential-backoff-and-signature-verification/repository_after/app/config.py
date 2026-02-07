import os

# Webhook configuration
MAX_RETRY_ATTEMPTS = int(os.getenv("MAX_RETRY_ATTEMPTS", "5"))
CONSECUTIVE_FAILURE_THRESHOLD = int(os.getenv("CONSECUTIVE_FAILURE_THRESHOLD", "10"))
DEFAULT_TIMEOUT_SECONDS = int(os.getenv("DEFAULT_TIMEOUT_SECONDS", "30"))

# Retry delays in seconds (exponential backoff)
RETRY_DELAYS = [60, 300, 1800, 7200, 86400]  # 1min, 5min, 30min, 2hr, 24hr

# Redis configuration
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# Database configuration
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:password@localhost:5432/webhooks")
