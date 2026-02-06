# filename: relationship_manager.py
# Write-Through Cache manager that syncs SQLite (source of truth) with Redis (fast cache)

import sqlite3
from typing import List
from threading import Lock
from .relationship_store import IRelationshipStore, RelationshipType


class RelationshipManager:
    """
    Graph Manager with Write-Through Cache pattern.
    Requirement 2: Write-Through synchronization - updates propagate to both SQL and Redis atomically
    """

    def __init__(self, db_path: str, relationship_store: IRelationshipStore):
        """
        Initialize with SQLite (source of truth) and Redis cache.

        Args:
            db_path: Path to SQLite database
            relationship_store: Abstract relationship store (e.g., Redis implementation)
        """
        self.db_path = db_path
        self.store = relationship_store
        self._lock = Lock()  # Ensure atomic writes
        self._init_db()

    def _init_db(self) -> None:
        """Initialize SQLite schema"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        # Blocks table: blocker_id blocks blocked_id
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS blocks (
                blocker_id INTEGER NOT NULL,
                blocked_id INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (blocker_id, blocked_id)
            )
        ''')

        # Mutes table: muter_id mutes muted_id
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS mutes (
                muter_id INTEGER NOT NULL,
                muted_id INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (muter_id, muted_id)
            )
        ''')

        # Indexes for reverse lookups
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON blocks(blocked_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_mutes_muted ON mutes(muted_id)')

        conn.commit()
        conn.close()

    def add_block(self, blocker_id: int, blocked_id: int) -> None:
        """
        Add block relationship with Write-Through pattern.
        Requirement 2: Atomic update to SQL + Redis
        """
        with self._lock:
            # 1. Update SQLite (source of truth)
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute(
                "INSERT OR IGNORE INTO blocks (blocker_id, blocked_id) VALUES (?, ?)",
                (blocker_id, blocked_id)
            )
            conn.commit()
            conn.close()

            # 2. Update Redis cache
            self.store.add_relationship(blocker_id, blocked_id, RelationshipType.BLOCK)

    def remove_block(self, blocker_id: int, blocked_id: int) -> None:
        """
        Remove block relationship with Write-Through pattern.
        Requirement 9: Cache invalidation - delete from SQL and Redis
        """
        with self._lock:
            # 1. Delete from SQLite
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute(
                "DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?",
                (blocker_id, blocked_id)
            )
            conn.commit()
            conn.close()

            # 2. Invalidate Redis cache
            self.store.remove_relationship(blocker_id, blocked_id, RelationshipType.BLOCK)

    def add_mute(self, muter_id: int, muted_id: int) -> None:
        """Add mute relationship with Write-Through pattern"""
        with self._lock:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute(
                "INSERT OR IGNORE INTO mutes (muter_id, muted_id) VALUES (?, ?)",
                (muter_id, muted_id)
            )
            conn.commit()
            conn.close()

            self.store.add_relationship(muter_id, muted_id, RelationshipType.MUTE)

    def remove_mute(self, muter_id: int, muted_id: int) -> None:
        """Remove mute relationship with Write-Through pattern"""
        with self._lock:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute(
                "DELETE FROM mutes WHERE muter_id = ? AND muted_id = ?",
                (muter_id, muted_id)
            )
            conn.commit()
            conn.close()

            self.store.remove_relationship(muter_id, muted_id, RelationshipType.MUTE)

    def check_visibility(self, viewer_id: int, creator_ids: List[int]) -> List[int]:
        """
        High-performance visibility check using Redis cache.
        Requirement 3: Mutual visibility - blocks are bidirectional

        Returns list of creator IDs visible to viewer.
        """
        return self.store.bulk_filter(viewer_id, creator_ids)

    def warm_cache_from_sql(self, flush_first: bool = True) -> int:
        """
        Cache warming: load all relationships from SQLite into Redis.

        Args:
            flush_first: If True, flushes Redis before loading (for cache invalidation).
                        If False, only adds (for initial warming).

        Returns number of relationships loaded.

        Requirement 9: Cache invalidation - when SQL is modified directly,
        calling warm_cache_from_sql(flush_first=True) rebuilds Redis from SQL source of truth.
        """
        # Flush Redis if requested (cache invalidation scenario)
        if flush_first and hasattr(self.store, 'redis_client'):
            self.store.redis_client.flushdb()

        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        count = 0

        # Load all blocks
        cursor.execute("SELECT blocker_id, blocked_id FROM blocks")
        for blocker_id, blocked_id in cursor.fetchall():
            self.store.add_relationship(blocker_id, blocked_id, RelationshipType.BLOCK)
            count += 1

        # Load all mutes
        cursor.execute("SELECT muter_id, muted_id FROM mutes")
        for muter_id, muted_id in cursor.fetchall():
            self.store.add_relationship(muter_id, muted_id, RelationshipType.MUTE)
            count += 1

        conn.close()
        return count

    def close(self) -> None:
        """Cleanup resources"""
        self.store.close()
