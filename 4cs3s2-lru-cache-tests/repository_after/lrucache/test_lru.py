"""
Test suite for LRUCache class.

This module contains pytest tests covering:
- Basic put/get operations
- LRU eviction policy
- TTL expiration
- Input validation
- Edge cases
"""

import os
import sys
import pytest  # type: ignore
from unittest.mock import patch

from lrucache.lru import LRUCache

MODULE_NAME = 'lrucache.lru'


@pytest.fixture
def basic_cache():
    """Create a basic LRUCache with capacity 3 and no TTL."""
    return LRUCache(capacity=3)


@pytest.fixture
def ttl_cache():
    """Create an LRUCache with capacity 3 and 5 second TTL."""
    return LRUCache(capacity=3, ttl_seconds=5.0)


@pytest.fixture
def small_cache():
    """Create an LRUCache with capacity 1 for edge case testing."""
    return LRUCache(capacity=1)


class TestBasicPutGet:
    """Tests for basic put and get operations."""

    def test_put_and_get_single_item(self, basic_cache):
        basic_cache.put("key1", "value1")
        result = basic_cache.get("key1")
        assert result == "value1"

    def test_put_and_get_multiple_items(self, basic_cache):
        basic_cache.put("key1", "value1")
        basic_cache.put("key2", "value2")
        basic_cache.put("key3", "value3")
        
        assert basic_cache.get("key1") == "value1"
        assert basic_cache.get("key2") == "value2"
        assert basic_cache.get("key3") == "value3"

    def test_put_and_get_various_types(self, basic_cache):
        basic_cache.put(1, "integer_key")
        basic_cache.put("string", 42)
        basic_cache.put((1, 2), {"nested": "dict"})
        
        assert basic_cache.get(1) == "integer_key"
        assert basic_cache.get("string") == 42
        assert basic_cache.get((1, 2)) == {"nested": "dict"}


class TestLRUEviction:
    """Tests for LRU eviction behavior when capacity is exceeded."""

    def test_lru_eviction_basic(self, basic_cache):
        basic_cache.put("key1", "value1")
        basic_cache.put("key2", "value2")
        basic_cache.put("key3", "value3")
        basic_cache.put("key4", "value4")
        
        assert basic_cache.get("key1") is None
        assert basic_cache.get("key2") == "value2"
        assert basic_cache.get("key3") == "value3"
        assert basic_cache.get("key4") == "value4"

    def test_lru_eviction_after_access(self, basic_cache):
        basic_cache.put("key1", "value1")
        basic_cache.put("key2", "value2")
        basic_cache.put("key3", "value3")
        basic_cache.get("key1")
        basic_cache.put("key4", "value4")
        
        assert basic_cache.get("key1") == "value1"
        assert basic_cache.get("key2") is None
        assert basic_cache.get("key3") == "value3"
        assert basic_cache.get("key4") == "value4"

    def test_lru_eviction_with_capacity_one(self, small_cache):
        small_cache.put("key1", "value1")
        assert small_cache.get("key1") == "value1"
        
        small_cache.put("key2", "value2")
        assert small_cache.get("key1") is None
        assert small_cache.get("key2") == "value2"


class TestUpdateExistingKey:
    """Tests for updating existing keys in the cache."""

    def test_update_existing_key_value(self, basic_cache):
        basic_cache.put("key1", "original_value")
        basic_cache.put("key1", "updated_value")
        assert basic_cache.get("key1") == "updated_value"

    def test_update_existing_key_refreshes_lru_order(self, basic_cache):
        basic_cache.put("key1", "value1")
        basic_cache.put("key2", "value2")
        basic_cache.put("key3", "value3")
        basic_cache.put("key1", "updated_value1")
        basic_cache.put("key4", "value4")
        
        assert basic_cache.get("key1") == "updated_value1"
        assert basic_cache.get("key2") is None
        assert basic_cache.get("key3") == "value3"
        assert basic_cache.get("key4") == "value4"

    def test_update_does_not_increase_size(self, basic_cache):
        basic_cache.put("key1", "value1")
        basic_cache.put("key2", "value2")
        assert basic_cache.size() == 2
        
        basic_cache.put("key1", "updated_value1")
        assert basic_cache.size() == 2


class TestTTLExpiration:
    """Tests for TTL expiration functionality."""

    def test_item_accessible_before_ttl_expires(self):
        with patch(f'{MODULE_NAME}.time') as mock_time:
            mock_time.time.return_value = 1000.0
            cache = LRUCache(capacity=3, ttl_seconds=5.0)
            cache.put("key1", "value1")
            assert cache.get("key1") == "value1"

    def test_item_expires_after_ttl(self):
        with patch(f'{MODULE_NAME}.time') as mock_time:
            mock_time.time.return_value = 1000.0
            cache = LRUCache(capacity=3, ttl_seconds=5.0)
            cache.put("key1", "value1")
            mock_time.time.return_value = 1006.0
            assert cache.get("key1") is None

    def test_item_accessible_at_exact_ttl_boundary(self):
        with patch(f'{MODULE_NAME}.time') as mock_time:
            mock_time.time.return_value = 1000.0
            cache = LRUCache(capacity=3, ttl_seconds=5.0)
            cache.put("key1", "value1")
            mock_time.time.return_value = 1005.0
            assert cache.get("key1") == "value1"

    def test_ttl_expiration_removes_item_from_cache(self):
        with patch(f'{MODULE_NAME}.time') as mock_time:
            mock_time.time.return_value = 1000.0
            cache = LRUCache(capacity=3, ttl_seconds=5.0)
            cache.put("key1", "value1")
            assert cache.size() == 1
            mock_time.time.return_value = 1006.0
            cache.get("key1")
            assert cache.size() == 0

    def test_multiple_items_with_different_expiration(self):
        with patch(f'{MODULE_NAME}.time') as mock_time:
            cache = LRUCache(capacity=5, ttl_seconds=5.0)
            mock_time.time.return_value = 1000.0
            cache.put("key1", "value1")
            mock_time.time.return_value = 1003.0
            cache.put("key2", "value2")
            mock_time.time.return_value = 1006.0
            assert cache.get("key1") is None
            assert cache.get("key2") == "value2"

    def test_cache_without_ttl_items_never_expire(self, basic_cache):
        with patch(f'{MODULE_NAME}.time') as mock_time:
            mock_time.time.return_value = 1000.0
            basic_cache.put("key1", "value1")
            mock_time.time.return_value = 1000000.0
            assert basic_cache.get("key1") == "value1"


class TestInvalidCapacity:
    """Tests for input validation on cache capacity."""

    def test_zero_capacity_raises_value_error(self):
        with pytest.raises(ValueError) as excinfo:
            LRUCache(capacity=0)
        assert "Capacity must be positive" in str(excinfo.value)

    def test_negative_capacity_raises_value_error(self):
        with pytest.raises(ValueError) as excinfo:
            LRUCache(capacity=-1)
        assert "Capacity must be positive" in str(excinfo.value)

    def test_negative_large_capacity_raises_value_error(self):
        with pytest.raises(ValueError) as excinfo:
            LRUCache(capacity=-100)
        assert "Capacity must be positive" in str(excinfo.value)


class TestClearMethod:
    """Tests for the clear method."""

    def test_clear_removes_all_items(self, basic_cache):
        basic_cache.put("key1", "value1")
        basic_cache.put("key2", "value2")
        basic_cache.put("key3", "value3")
        basic_cache.clear()
        
        assert basic_cache.size() == 0
        assert basic_cache.get("key1") is None
        assert basic_cache.get("key2") is None
        assert basic_cache.get("key3") is None

    def test_clear_on_empty_cache(self, basic_cache):
        basic_cache.clear()
        assert basic_cache.size() == 0

    def test_cache_usable_after_clear(self, basic_cache):
        basic_cache.put("key1", "value1")
        basic_cache.clear()
        basic_cache.put("key2", "value2")
        assert basic_cache.get("key2") == "value2"
        assert basic_cache.size() == 1


class TestSizeMethod:
    """Tests for the size method."""

    def test_size_on_empty_cache(self, basic_cache):
        assert basic_cache.size() == 0

    def test_size_after_adding_items(self, basic_cache):
        basic_cache.put("key1", "value1")
        assert basic_cache.size() == 1
        basic_cache.put("key2", "value2")
        assert basic_cache.size() == 2
        basic_cache.put("key3", "value3")
        assert basic_cache.size() == 3

    def test_size_after_eviction(self, basic_cache):
        basic_cache.put("key1", "value1")
        basic_cache.put("key2", "value2")
        basic_cache.put("key3", "value3")
        basic_cache.put("key4", "value4")
        assert basic_cache.size() == 3

    def test_size_includes_expired_items_lazy_expiration(self):
        with patch(f'{MODULE_NAME}.time') as mock_time:
            mock_time.time.return_value = 1000.0
            cache = LRUCache(capacity=3, ttl_seconds=5.0)
            cache.put("key1", "value1")
            cache.put("key2", "value2")
            mock_time.time.return_value = 1006.0
            assert cache.size() == 2
            cache.get("key1")
            cache.get("key2")
            assert cache.size() == 0


class TestMissingKeys:
    """Tests for get behavior with missing keys."""

    def test_get_nonexistent_key_returns_none(self, basic_cache):
        result = basic_cache.get("nonexistent_key")
        assert result is None

    def test_get_after_eviction_returns_none(self, basic_cache):
        basic_cache.put("key1", "value1")
        basic_cache.put("key2", "value2")
        basic_cache.put("key3", "value3")
        basic_cache.put("key4", "value4")
        assert basic_cache.get("key1") is None


class TestEdgeCases:
    """Additional edge case tests."""

    def test_capacity_one_with_updates(self, small_cache):
        small_cache.put("key1", "value1")
        small_cache.put("key1", "updated_value1")
        assert small_cache.get("key1") == "updated_value1"
        assert small_cache.size() == 1

    def test_none_as_value(self, basic_cache):
        basic_cache.put("key1", None)
        result = basic_cache.get("key1")
        assert result is None

    def test_empty_string_key_and_value(self, basic_cache):
        basic_cache.put("", "empty_key_value")
        basic_cache.put("empty_value", "")
        assert basic_cache.get("") == "empty_key_value"
        assert basic_cache.get("empty_value") == ""

    def test_large_capacity_cache(self):
        cache = LRUCache(capacity=1000)
        for i in range(1000):
            cache.put(f"key{i}", f"value{i}")
        assert cache.size() == 1000
        assert cache.get("key0") == "value0"
        assert cache.get("key999") == "value999"

    def test_ttl_refresh_on_update(self):
        with patch(f'{MODULE_NAME}.time') as mock_time:
            mock_time.time.return_value = 1000.0
            cache = LRUCache(capacity=3, ttl_seconds=5.0)
            cache.put("key1", "value1")
            mock_time.time.return_value = 1003.0
            cache.put("key1", "updated_value")
            mock_time.time.return_value = 1007.0
            assert cache.get("key1") == "updated_value"
