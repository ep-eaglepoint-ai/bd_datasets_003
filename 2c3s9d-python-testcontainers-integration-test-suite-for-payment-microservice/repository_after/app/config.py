import os
import asyncpg
import redis.asyncio as redis
import aio_pika

_db_pool = None
_redis = None
_rabbitmq = None


async def get_db_pool():
    global _db_pool
    if _db_pool is None:
        _db_pool = await asyncpg.create_pool(os.environ.get("DATABASE_URL"))
    return _db_pool


async def get_redis():
    global _redis
    if _redis is None:
        _redis = redis.from_url(os.environ.get("REDIS_URL"))
    return _redis


async def get_rabbitmq_connection():
    global _rabbitmq
    if _rabbitmq is None:
        _rabbitmq = await aio_pika.connect_robust(os.environ.get("RABBITMQ_URL"))
    return _rabbitmq


async def close_connections():
    global _db_pool, _redis, _rabbitmq
    # Only close if connections exist and are not from a closed event loop
    try:
        if _db_pool:
            try:
                await _db_pool.close()
            except RuntimeError:
                pass  # Event loop already closed
            _db_pool = None
    except RuntimeError:
        _db_pool = None
    try:
        if _redis:
            try:
                await _redis.aclose()
            except RuntimeError:
                pass  # Event loop already closed
            _redis = None
    except RuntimeError:
        _redis = None
    try:
        if _rabbitmq:
            try:
                await _rabbitmq.close()
            except RuntimeError:
                pass  # Event loop already closed
            _rabbitmq = None
    except RuntimeError:
        _rabbitmq = None
