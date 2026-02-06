"""
Database configuration and session management.

This module provides async SQLAlchemy database engine and session factory
for the webhook delivery system.
"""

import asyncio
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

from models import Base


# Database configuration
DATABASE_URL = "postgresql+asyncpg://postgres:postgres@localhost:5432/webhooks"


# Create async engine
engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

# Session factory
async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def init_db() -> None:
    """
    Initialize database tables.
    
    Creates all tables defined in the models if they don't exist.
    """
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def drop_db() -> None:
    """
    Drop all database tables.
    
    WARNING: This is destructive and should only be used in testing.
    """
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """
    Dependency that provides a database session.
    
    Yields:
        AsyncSession: Database session for the request.
    """
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def get_db_session() -> AsyncSession:
    """
    Get a database session directly (for background tasks).
    
    Returns:
        AsyncSession: New database session that must be closed by caller.
    """
    return async_session_factory()


async def close_db() -> None:
    """
    Close database connections gracefully.
    
    Should be called during application shutdown.
    """
    await engine.dispose()
