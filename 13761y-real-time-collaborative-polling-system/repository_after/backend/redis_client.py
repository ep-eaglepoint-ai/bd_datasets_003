import redis.asyncio as redis
import os

REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))

class RedisClient:
    def __init__(self):
        self.redis = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)

    async def get_poll_results(self, poll_id: str):
        return await self.redis.hgetall(f"poll:{poll_id}:results")

    async def cast_vote(self, poll_id: str, option_id: str, client_ip: str) -> bool:
        # Check if IP has already voted for this poll
        voted = await self.redis.sismember(f"poll:{poll_id}:voters", client_ip)
        if voted:
            return False
        
        # Atomic vote increment and record voter IP
        async with self.redis.pipeline(transaction=True) as pipe:
            await pipe.sadd(f"poll:{poll_id}:voters", client_ip)
            await pipe.hincrby(f"poll:{poll_id}:results", option_id, 1)
            await pipe.execute()
        return True

    async def create_poll(self, poll_id: str, options: list[str]):
        # Initialize poll results with 0
        mapping = {option: 0 for option in options}
        await self.redis.hset(f"poll:{poll_id}:results", mapping=mapping)

redis_client = RedisClient()
