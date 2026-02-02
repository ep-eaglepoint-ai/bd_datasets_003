import asyncio
import hashlib
import json
from typing import Any, Dict, Iterable, Optional

from redis.asyncio import Redis

LIST_TTL_SECONDS = 300
SEARCH_TTL_SECONDS = 180
DETAIL_TTL_SECONDS = 300


def make_cache_key(prefix: str, params: Dict[str, Any]) -> str:
    payload = json.dumps(params, sort_keys=True, separators=(",", ":"), default=str)
    digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()
    return f"{prefix}:{digest}"


async def cache_get(redis: Redis, key: str) -> Optional[str]:
    return await redis.get(key)


async def cache_set(redis: Redis, key: str, value: str, ttl_seconds: int) -> None:
    await redis.set(key, value, ex=ttl_seconds)


async def invalidate_keys(redis: Redis, patterns: Iterable[str]) -> None:
    for pattern in patterns:
        async for key in redis.scan_iter(match=pattern, count=500):
            await redis.delete(key)


async def invalidate_product_cache(redis: Redis, product_id: Optional[int] = None) -> None:
    patterns = ["products:list:*", "products:search:*"]
    if product_id is not None:
        patterns.append(f"products:detail:{product_id}")
    await invalidate_keys(redis, patterns)


def schedule_cache_invalidation(redis: Redis, product_id: Optional[int] = None) -> None:
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return
    loop.create_task(invalidate_product_cache(redis, product_id))
