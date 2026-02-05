"""Redis client with atomic operations for burn-on-read."""
import json
import redis
from typing import Optional
from .config import Config


class RedisClient:
    """Redis client wrapper with atomic burn-on-read operations."""
    
    # Lua script for atomic GET + DEL operation
    BURN_ON_READ_SCRIPT = """
    local value = redis.call('GET', KEYS[1])
    if value then
        redis.call('DEL', KEYS[1])
    end
    return value
    """
    
    def __init__(self):
        """Initialize Redis connection."""
        self.redis_client = redis.Redis(
            host=Config.REDIS_HOST,
            port=Config.REDIS_PORT,
            db=Config.REDIS_DB,
            password=Config.REDIS_PASSWORD,
            decode_responses=False  # We need bytes for encrypted data
        )
        # Pre-load the Lua script for better performance
        self.burn_script = self.redis_client.register_script(self.BURN_ON_READ_SCRIPT)
    
    def store_secret(self, key: str, ciphertext: bytes, nonce: bytes, ttl_seconds: int) -> None:
        """Store encrypted secret in Redis with TTL.
        
        Args:
            key: Redis key (UUID)
            ciphertext: Encrypted secret bytes
            nonce: Encryption nonce bytes
            ttl_seconds: Time to live in seconds
        """
        # Store as JSON: {"ciphertext": base64, "nonce": base64}
        import base64
        data = {
            "ciphertext": base64.b64encode(ciphertext).decode('utf-8'),
            "nonce": base64.b64encode(nonce).decode('utf-8')
        }
        value = json.dumps(data).encode('utf-8')
        
        # Store with expiration
        self.redis_client.setex(key, ttl_seconds, value)
    
    def get_and_delete_secret(self, key: str) -> Optional[dict]:
        """Atomically get and delete a secret from Redis.
        
        This operation is atomic and prevents race conditions where
        multiple requests could read the same secret.
        
        Args:
            key: Redis key (UUID)
            
        Returns:
            Dictionary with 'ciphertext' and 'nonce' keys, or None if not found
        """
        # Execute atomic GET + DEL using Lua script
        result = self.burn_script(keys=[key])
        
        if result is None:
            return None
        
        # Parse JSON response
        try:
            import base64
            data = json.loads(result.decode('utf-8'))
            return {
                "ciphertext": base64.b64decode(data["ciphertext"]),
                "nonce": base64.b64decode(data["nonce"])
            }
        except (json.JSONDecodeError, KeyError, ValueError) as e:
            # If parsing fails, the data is corrupted
            return None
    
    def ping(self) -> bool:
        """Check Redis connection.
        
        Returns:
            True if connected, False otherwise
        """
        try:
            return self.redis_client.ping()
        except Exception:
            return False


# Global Redis client instance
redis_client = RedisClient()

