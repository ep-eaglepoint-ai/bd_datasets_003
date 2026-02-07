import os

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/notifications")

WEBHOOK_TIMEOUT = 30
MAX_RETRIES = 5
RETRY_DELAYS = [60, 300, 1800, 7200, 86400]
