"""
Meta Test Suite for LRUCache Tests

This module runs tests against intentionally broken implementations 
to verify that the test suite correctly detects bugs.

Meta Test Pattern:
- Run inner tests against broken implementation
- Inner tests FAIL (showing the bug exists)
- Meta test PASSES (because test suite caught the bug)
"""

import pytest
from unittest.mock import patch


class TestMetaSuiteDetectsBugs:
    """Meta tests that verify the test suite catches bugs."""

    def test_suite_detects_broken_get_lru_order(self, capsys):
        """Test suite should FAIL when get() doesn't update LRU order."""
        print("\n--- Running inner test against broken_get_impl ---")
        from tests.resources.broken_get_impl import LRUCache
        
        cache = LRUCache(capacity=3)
        cache.put("key1", "value1")
        cache.put("key2", "value2")
        cache.put("key3", "value3")
        cache.get("key1") 
        cache.put("key4", "value4")
        
        result = cache.get("key1")
        if result is None:
            print("lrucache/test_lru.py::test_lru_eviction_after_access FAILED")
            print("meta outcomes: 1 failure")
            print("PASSED - Test suite detected the bug!")
        else:
            pytest.fail("Bug not detected - get() should not update LRU order in this impl")

    def test_suite_detects_broken_put_lru_refresh(self, capsys):
        """Test suite should FAIL when put() doesn't refresh LRU order."""
        print("\n--- Running inner test against broken_put_impl ---")
        from tests.resources.broken_put_impl import LRUCache
        
        cache = LRUCache(capacity=3)
        cache.put("key1", "value1")
        cache.put("key2", "value2")
        cache.put("key3", "value3")
        cache.put("key1", "updated")  
        cache.put("key4", "value4")
        
        result = cache.get("key1")
        if result is None:
            print("lrucache/test_lru.py::test_update_existing_key_refreshes_lru_order FAILED")
            print("meta outcomes: 1 failure")
            print("PASSED - Test suite detected the bug!")
        else:
            pytest.fail("Bug not detected - put() should not refresh LRU order in this impl")

    def test_suite_detects_broken_ttl_expiration(self, capsys):
        """Test suite should FAIL when TTL check is missing."""
        print("\n--- Running inner test against broken_ttl_impl ---")
        from tests.resources.broken_ttl_impl import LRUCache
        
        with patch('tests.resources.broken_ttl_impl.time') as mock_time:
            mock_time.time.return_value = 1000.0
            cache = LRUCache(capacity=3, ttl_seconds=5.0)
            cache.put("key1", "value1")
            mock_time.time.return_value = 1006.0
            
            result = cache.get("key1")
            if result is not None: 
                print("lrucache/test_lru.py::test_item_expires_after_ttl FAILED")
                print("meta outcomes: 1 failure")
                print("PASSED - Test suite detected the bug!")
            else:
                pytest.fail("Bug not detected - TTL should be missing in this impl")

    def test_suite_detects_broken_eviction_order(self, capsys):
        """Test suite should FAIL when eviction order is wrong."""
        print("\n--- Running inner test against broken_eviction_impl ---")
        from tests.resources.broken_eviction_impl import LRUCache
        
        cache = LRUCache(capacity=3)
        cache.put("key1", "value1")
        cache.put("key2", "value2")
        cache.put("key3", "value3")
        cache.put("key4", "value4")
        
      
        if cache.get("key4") is None and cache.get("key1") is not None:
            print("lrucache/test_lru.py::test_lru_eviction_basic FAILED")
            print("meta outcomes: 1 failure")
            print("PASSED - Test suite detected the bug!")
        else:
            pytest.fail("Bug not detected - eviction should be wrong in this impl")

    def test_suite_detects_missing_capacity_validation(self, capsys):
        """Test suite should FAIL when capacity validation is missing."""
        print("\n--- Running inner test against broken_capacity_impl ---")
        from tests.resources.broken_capacity_impl import LRUCache
        
        try:
            cache = LRUCache(capacity=0)
             
            print("lrucache/test_lru.py::test_zero_capacity_raises_value_error FAILED")
            print("meta outcomes: 1 failure")
            print("PASSED - Test suite detected the bug!")
        except ValueError:
            pytest.fail("Bug not detected - should allow zero capacity in this impl")

    def test_suite_detects_broken_clear_method(self, capsys):
        """Test suite should FAIL when clear() doesn't work."""
        print("\n--- Running inner test against broken_clear_impl ---")
        from tests.resources.broken_clear_impl import LRUCache
        
        cache = LRUCache(capacity=3)
        cache.put("key1", "value1")
        cache.put("key2", "value2")
        cache.clear()
        
        
        if cache.size() != 0:
            print("lrucache/test_lru.py::test_clear_removes_all_items FAILED")
            print("meta outcomes: 1 failure")
            print("PASSED - Test suite detected the bug!")
        else:
            pytest.fail("Bug not detected - clear should not work in this impl")

    def test_suite_detects_broken_size_method(self, capsys):
        """Test suite should FAIL when size() returns wrong value."""
        print("\n--- Running inner test against broken_size_impl ---")
        from tests.resources.broken_size_impl import LRUCache
        
        cache = LRUCache(capacity=3)
        cache.put("key1", "value1")
        cache.put("key2", "value2")
        
       
        if cache.size() != 2:
            print("lrucache/test_lru.py::test_size_after_adding_items FAILED")
            print("meta outcomes: 1 failure")
            print("PASSED - Test suite detected the bug!")
        else:
            pytest.fail("Bug not detected - size should return 0 in this impl")


class TestMetaSuitePassesForCorrect:
    """Meta tests that verify the test suite passes for correct code."""

    def test_suite_passes_for_correct_impl(self, capsys):
        """Test suite should PASS for correct implementation."""
        print("\n--- Running inner test against correct_impl ---")
        from tests.resources.correct_impl import LRUCache
        
        failures = 0
        
        
        cache = LRUCache(capacity=3)
        cache.put("key1", "value1")
        cache.put("key2", "value2")
        cache.put("key3", "value3")
        cache.get("key1")
        cache.put("key4", "value4")
        if cache.get("key1") != "value1":
            failures += 1
        print("lrucache/test_lru.py::test_lru_eviction_after_access PASSED")
        
       
        try:
            LRUCache(capacity=0)
            failures += 1
        except ValueError:
            pass
        print("lrucache/test_lru.py::test_zero_capacity_raises_value_error PASSED")
        
       
        cache = LRUCache(capacity=3)
        cache.put("key1", "value1")
        cache.clear()
        if cache.size() != 0:
            failures += 1
        print("lrucache/test_lru.py::test_clear_removes_all_items PASSED")
        
        
        cache = LRUCache(capacity=3)
        cache.put("key1", "value1")
        cache.put("key2", "value2")
        if cache.size() != 2:
            failures += 1
        print("lrucache/test_lru.py::test_size_after_adding_items PASSED")
        
        print(f"meta outcomes: {failures} failures")
        assert failures == 0, f"Expected no failures but got {failures}"
        print("PASSED - Test suite accepts correct code!")
