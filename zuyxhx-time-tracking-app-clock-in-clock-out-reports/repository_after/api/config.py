"""Application configuration."""

import os
from functools import lru_cache


class Settings:
    """Application settings loaded from environment variables."""
    
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL", 
        "postgresql://postgres:postgres@db:5432/app_db"
    )
    SECRET_KEY: str = os.getenv("SECRET_KEY", "dev-secret-key-change-in-production")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24
    APP_NAME: str = "Time Tracking API"


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    print(f"settings: ", Settings().DATABASE_URL)
    return Settings()
