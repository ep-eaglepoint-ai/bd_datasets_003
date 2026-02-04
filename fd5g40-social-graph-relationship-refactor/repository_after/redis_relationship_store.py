# filename: redis_relationship_store.py
# Redis-backed implementation of IRelationshipStore using Sets for O(1) lookups

import redis
from typing import List, Set
from .relationship_store import IRelationshipStore, RelationshipType


class RedisRelationshipStore(IRelationshipStore):
    """
    Redis-backed relationship store using Sets for O(1) membership checks.
    Requirements 1, 4, 5, 6: Abstract interface, Redis Sets, Bulk filter, Thread-safe
    """

    def __init__(self, host: str = 'localhost', port: int = 6379, db: int = 0, max_connections: int = 50):
        """
        Initialize Redis connection pool for thread-safe concurrent access.
        Requirement 6: Thread-safe with connection pooling
        """
        # Connection pool for thread-safe concurrent requests
        self.pool = redis.ConnectionPool(
            host=host,
            port=port,
            db=db,
            max_connections=max_connections,
            decode_responses=False  # Work with bytes for performance
        )
        self.redis_client = redis.Redis(connection_pool=self.pool)

    def _get_key(self, user_id: int, rel_type: RelationshipType, direction: str) -> str:
        """
        Generate Redis key for relationship storage.
        Requirement 4: Separate keyspaces for Block/Mute types

        Format: {rel_type}:{direction}:{user_id}
        Examples:
        - block:out:123 -> Set of IDs that user 123 has blocked
        - block:in:123  -> Set of IDs that have blocked user 123
        - mute:out:456  -> Set of IDs that user 456 has muted
        """
        return f"{rel_type.value}:{direction}:{user_id}"

    def add_relationship(self, from_id: int, to_id: int, rel_type: RelationshipType) -> None:
        """
        Add relationship with bidirectional tracking.

        When user A blocks/mutes user B:
        - Add B to A's outgoing set
        - Add A to B's incoming set
        """
        pipe = self.redis_client.pipeline()

        # Outgoing: from_id -> to_id
        outgoing_key = self._get_key(from_id, rel_type, "out")
        pipe.sadd(outgoing_key, to_id)

        # Incoming: to_id <- from_id
        incoming_key = self._get_key(to_id, rel_type, "in")
        pipe.sadd(incoming_key, from_id)

        pipe.execute()

    def remove_relationship(self, from_id: int, to_id: int, rel_type: RelationshipType) -> None:
        """Remove relationship from both directions"""
        pipe = self.redis_client.pipeline()

        outgoing_key = self._get_key(from_id, rel_type, "out")
        pipe.srem(outgoing_key, to_id)

        incoming_key = self._get_key(to_id, rel_type, "in")
        pipe.srem(incoming_key, from_id)

        pipe.execute()

    def has_relationship(self, from_id: int, to_id: int, rel_type: RelationshipType) -> bool:
        """
        O(1) membership check using Redis SISMEMBER.
        Requirement 1: O(1) membership lookups
        """
        key = self._get_key(from_id, rel_type, "out")
        return self.redis_client.sismember(key, to_id)

    def get_related_ids(self, user_id: int, rel_type: RelationshipType, direction: str = "out") -> Set[int]:
        """Get all IDs related to user_id"""
        key = self._get_key(user_id, rel_type, direction)
        members = self.redis_client.smembers(key)
        return {int(m) for m in members}

    def bulk_filter(self, viewer_id: int, candidate_ids: List[int]) -> List[int]:
        """
        Requirement 5: Bulk filter using Redis pipeline for minimal network round-trips.

        Filters out candidates where:
        1. Candidate blocks viewer (block:out:candidate contains viewer)
        2. Viewer mutes candidate (mute:out:viewer contains candidate)

        Requirement 3: Mutual visibility - if block exists in either direction, hide both
        """
        if not candidate_ids:
            return []

        # Use pipeline to batch all Redis operations
        pipe = self.redis_client.pipeline()

        # For each candidate, check:
        # 1. Does candidate block viewer? (block:out:candidate contains viewer_id)
        # 2. Does viewer block candidate? (block:out:viewer contains candidate)
        # 3. Does viewer mute candidate? (mute:out:viewer contains candidate)

        # Batch check if viewer blocks any candidates
        viewer_blocks_key = self._get_key(viewer_id, RelationshipType.BLOCK, "out")
        viewer_mutes_key = self._get_key(viewer_id, RelationshipType.MUTE, "out")

        for cid in candidate_ids:
            # Check if candidate blocks viewer
            pipe.sismember(self._get_key(cid, RelationshipType.BLOCK, "out"), viewer_id)
            # Check if viewer blocks candidate
            pipe.sismember(viewer_blocks_key, cid)
            # Check if viewer mutes candidate
            pipe.sismember(viewer_mutes_key, cid)

        # Execute all checks in one network round-trip
        results = pipe.execute()

        # Filter candidates based on results
        allowed_ids = []
        for i, cid in enumerate(candidate_ids):
            # Results are in groups of 3 per candidate
            candidate_blocks_viewer = results[i * 3]
            viewer_blocks_candidate = results[i * 3 + 1]
            viewer_mutes_candidate = results[i * 3 + 2]

            # Requirement 3: Mutual visibility - block in either direction hides both
            if candidate_blocks_viewer or viewer_blocks_candidate:
                continue  # Hidden due to block (mutual)

            # Viewer mutes candidate
            if viewer_mutes_candidate:
                continue  # Hidden due to mute

            allowed_ids.append(cid)

        return allowed_ids

    def close(self) -> None:
        """Close Redis connection pool"""
        self.redis_client.close()
