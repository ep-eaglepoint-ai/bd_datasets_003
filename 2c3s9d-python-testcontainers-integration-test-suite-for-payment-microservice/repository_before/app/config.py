import os
import asyncpg
import aioredis
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
        _redis = await aioredis.from_url(os.environ.get("REDIS_URL"))
    return _redis


async def get_rabbitmq_connection():
    global _rabbitmq
    if _rabbitmq is None:
        _rabbitmq = await aio_pika.connect_robust(os.environ.get("RABBITMQ_URL"))
    return _rabbitmq


async def close_connections():
    global _db_pool, _redis, _rabbitmq
    if _db_pool:
        await _db_pool.close()
        _db_pool = None
    if _redis:
        await _redis.close()
        _redis = None
    if _rabbitmq:
        await _rabbitmq.close()
        _rabbitmq = None
