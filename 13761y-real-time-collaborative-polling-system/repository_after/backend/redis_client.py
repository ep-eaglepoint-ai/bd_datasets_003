import redis.asyncio as redis
import os
import json

REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
POLL_UPDATES_CHANNEL = "poll_updates"

class RedisClient:
    def __init__(self):
        self.redis = None
        self.pubsub = None

    async def _get_redis(self):
        """Get or create Redis connection with proper async handling"""
        if self.redis is None:
            self.redis = redis.Redis(
                host=REDIS_HOST,
                port=REDIS_PORT,
                decode_responses=True,
                single_connection_client=False  # Allow connection pooling
            )
        return self.redis

    async def publish_vote_update(self, poll_id: str, results: dict):
        """Publish vote update to Redis Pub/Sub channel for horizontal scaling"""
        r = await self._get_redis()
        message = json.dumps({
            "poll_id": poll_id,
            "type": "results_update",
            "results": results
        })
        await r.publish(POLL_UPDATES_CHANNEL, message)

    async def get_pubsub(self):
        """Get or create Redis Pub/Sub connection"""
        if self.pubsub is None:
            r = await self._get_redis()
            self.pubsub = r.pubsub()
            await self.pubsub.subscribe(POLL_UPDATES_CHANNEL)
        return self.pubsub

    async def get_poll_results(self, poll_id: str):
        r = await self._get_redis()
        return await r.hgetall(f"poll:{poll_id}:results")

    async def cast_vote(self, poll_id: str, option_id: str, client_ip: str) -> bool:
        r = await self._get_redis()
        # Check if IP has already voted for this poll
        voted = await r.sismember(f"poll:{poll_id}:voters", client_ip)
        if voted:
            return False
        
        # Atomic vote increment and record voter IP
        async with r.pipeline(transaction=True) as pipe:
            await pipe.sadd(f"poll:{poll_id}:voters", client_ip)
            await pipe.hincrby(f"poll:{poll_id}:results", option_id, 1)
            await pipe.execute()
        return True

    async def create_poll(self, poll_id: str, options: list[str]):
        r = await self._get_redis()
        # Initialize poll results with 0
        mapping = {option: 0 for option in options}
        await r.hset(f"poll:{poll_id}:results", mapping=mapping)

redis_client = RedisClient()