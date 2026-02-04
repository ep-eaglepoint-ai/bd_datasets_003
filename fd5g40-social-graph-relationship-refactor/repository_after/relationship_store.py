# filename: relationship_store.py
# Abstract interface for relationship storage following Dependency Inversion Principle

from abc import ABC, abstractmethod
from typing import List, Set, Tuple
from enum import Enum


class RelationshipType(Enum):
    """Types of relationships that can be stored"""
    BLOCK = "block"
    MUTE = "mute"


class IRelationshipStore(ABC):
    """
    Abstract interface for relationship storage.
    Allows swapping Redis for Neo4j, Graph-indexed SQL, or other backends.
    Requirement 1: Abstract 'IRelationshipStore' interface
    """

    @abstractmethod
    def add_relationship(self, from_id: int, to_id: int, rel_type: RelationshipType) -> None:
        """Add a relationship between two users"""
        pass

    @abstractmethod
    def remove_relationship(self, from_id: int, to_id: int, rel_type: RelationshipType) -> None:
        """Remove a relationship between two users"""
        pass

    @abstractmethod
    def has_relationship(self, from_id: int, to_id: int, rel_type: RelationshipType) -> bool:
        """
        Check if a relationship exists (O(1) operation).
        Requirement 1: O(1) membership lookups
        """
        pass

    @abstractmethod
    def get_related_ids(self, user_id: int, rel_type: RelationshipType, direction: str = "outgoing") -> Set[int]:
        """
        Get all IDs related to user_id for a specific relationship type.
        direction: 'outgoing' (user_id -> others) or 'incoming' (others -> user_id)
        """
        pass

    @abstractmethod
    def bulk_filter(self, viewer_id: int, candidate_ids: List[int]) -> List[int]:
        """
        Requirement 5: Bulk filter that processes 1000+ IDs in a single pass.
        Returns IDs visible to viewer_id (not blocked/muted).
        """
        pass

    @abstractmethod
    def close(self) -> None:
        """Cleanup resources"""
        pass
