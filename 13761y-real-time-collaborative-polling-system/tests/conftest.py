import pytest
import pytest_asyncio
from repository_after.backend.redis_client import redis_client
from repository_after.backend.main import polls_db


@pytest_asyncio.fixture(scope="function", autouse=True)
async def cleanup_redis():
    """Clean up Redis and in-memory state before and after each test to avoid state pollution"""
    # Clear in-memory polls_db to avoid state pollution between tests
    polls_db.clear()

    # Ensure we have a fresh Redis connection for each test
    if redis_client.redis is not None:
        try:
            await redis_client.redis.aclose()
        except Exception:
            pass
        redis_client.redis = None

    # Cleanup before test
    try:
        r = await redis_client._get_redis()
        keys = await r.keys("poll:*")
        if keys:
            await r.delete(*keys)
    except Exception:
        pass

    yield

    # Cleanup after test
    try:
        r = await redis_client._get_redis()
        keys = await r.keys("poll:*")
        if keys:
            await r.delete(*keys)
    except Exception:
        pass

    # Clear in-memory state after test
    polls_db.clear()

    # Close connection after test
    if redis_client.redis is not None:
        try:
            await redis_client.redis.aclose()
        except Exception:
            pass
        redis_client.redis = None


@pytest.fixture(scope="session", autouse=True)
def event_loop_policy():
    """Set event loop policy for proper cleanup"""
    import asyncio
    asyncio.set_event_loop_policy(asyncio.DefaultEventLoopPolicy())