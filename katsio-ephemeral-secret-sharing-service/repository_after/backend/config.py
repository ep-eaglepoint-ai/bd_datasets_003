"""Configuration management for the application."""
import os
import secrets
from typing import Optional


class Config:
    """Application configuration."""
    
    # Redis configuration
    REDIS_HOST: str = os.getenv("REDIS_HOST", "localhost")
    REDIS_PORT: int = int(os.getenv("REDIS_PORT", "6379"))
    REDIS_DB: int = int(os.getenv("REDIS_DB", "0"))
    REDIS_PASSWORD: Optional[str] = os.getenv("REDIS_PASSWORD", None)
    
    # Encryption key
    AES_KEY: Optional[bytes] = None
    
    # CORS settings
    CORS_ORIGINS: list[str] = os.getenv(
        "CORS_ORIGINS", 
        "http://localhost:3000,http://localhost:5173"
    ).split(",")
    
    # API settings
    API_PREFIX: str = "/api"
    
    @classmethod
    def get_encryption_key(cls) -> bytes:
        """Get or generate AES encryption key."""
        if cls.AES_KEY is None:
            key_env = os.getenv("AES_KEY")
            if key_env:
                # Key should be 32 bytes (256 bits) for AES-256
                key_bytes = key_env.encode() if isinstance(key_env, str) else key_env
                if len(key_bytes) == 32:
                    cls.AES_KEY = key_bytes
                else:
                    raise ValueError(
                        f"AES_KEY must be exactly 32 bytes, got {len(key_bytes)} bytes"
                    )
            else:
                # Generate a random 32-byte key
                cls.AES_KEY = secrets.token_bytes(32)
                print(f"WARNING: Generated AES key (not from env). Key: {cls.AES_KEY.hex()}")
                print("Set AES_KEY environment variable for production use.")
        return cls.AES_KEY

