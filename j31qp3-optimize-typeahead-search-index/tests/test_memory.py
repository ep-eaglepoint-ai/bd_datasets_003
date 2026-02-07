import sys
import pytest
import time
import os
import resource

def test_large_dataset_no_crash(SearchIndexClass):
    # Insert 10k items
    # This is a smoke test for memory/recursion depth issues
    index = SearchIndexClass()
    for i in range(10000):
        index.insert(f"term_{i}", i)
        
    res = index.search("term_", 5)
    assert len(res) == 5
    # The order depends on scores. Here scores are increasing with i.
    # So max is 9999.
    assert res[0] == "term_9999"

def test_memory_usage_at_scale(SearchIndexClass):
    """
    Requirement 5: Ensure memory usage remains efficient under 256MB RAM limit.
    Insert 100,000 terms and verify memory stays well within bounds.
    """
    import gc
    gc.collect()
    
    # Measure baseline memory
    baseline_rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss  # in KB on Linux
    
    index = SearchIndexClass()
    for i in range(100_000):
        index.insert(f"term_{i:06d}", i)
    
    gc.collect()
    current_rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss  # in KB on Linux
    
    # Memory delta should stay well under 256MB (262144 KB)
    # With 100k terms of ~10 chars each, a trie should use far less than 256MB
    delta_kb = current_rss - baseline_rss
    delta_mb = delta_kb / 1024
    
    print(f"\nMemory usage for 100k terms: {delta_mb:.1f} MB (RSS delta)")
    
    # Assert we stay well under 256MB — with 100k terms we should be under 100MB
    assert delta_mb < 200, f"Memory usage {delta_mb:.1f} MB exceeds safe threshold for 256MB container"
    
    # Verify search still works correctly at this scale
    results = index.search("term_0999", limit=5)
    assert len(results) > 0
    assert all(r.startswith("term_0999") for r in results)

def test_no_redundant_string_storage(SearchIndexClass):
    """
    Requirement 5: Verify terms are NOT stored as strings in trie nodes.
    The trie structure reconstructs terms from the path.
    """
    index = SearchIndexClass()
    
    long_term = "abcdefghijklmnopqrstuvwxyz" * 10  # 260 chars
    index.insert(long_term, 100)
    
    # Walk the trie path — no node should have a 'term' attribute
    if not hasattr(index, 'root'):
        pytest.skip("SearchIndex implementation does not expose 'root' (likely Naive implementation), skipping structure test.")
        
    node = index.root
    for ch in long_term:
        assert ch in node.children
        child = node.children[ch]
        assert not hasattr(child, 'term'), "Node stores redundant 'term' string"
        node = child
    
    # Despite no term storage, search must reconstruct the full term
    results = index.search("abcdefghij", limit=1)
    assert results == [long_term]

def test_memory_enforced_strictness(SearchIndexClass):
    """
    Requirement 5: Enforce strict 256MB RAM limit using resource limits.
    If the implementation leaks memory or is inefficient, this test will crash with MemoryError.
    """
    try:
        soft, hard = resource.getrlimit(resource.RLIMIT_AS)
        limit_bytes = 256 * 1024 * 1024  # 256MB
        
        # Only set if feasible (hard limit allows it)
        if hard == -1 or hard >= limit_bytes:
            resource.setrlimit(resource.RLIMIT_AS, (limit_bytes, hard))
        else:
            pytest.skip(f"System hard limit {hard} is lower than 256MB, cannot enforce limit test.")
            
    except (ValueError, OSError) as e:
        pytest.skip(f"Could not set RLIMIT_AS: {e}")
        
    try:
        index = SearchIndexClass()
        # Insert substantial data to pressure memory
        for i in range(50000):
            index.insert(f"term_{i}", i)
            
        assert True
    except MemoryError:
        pytest.fail("MemoryError: Implementation exceeded 256MB strict limit!")
    finally:
        # Reset limit if possible (though process layout might prevent full reset effectively)
        try:
            resource.setrlimit(resource.RLIMIT_AS, (soft, hard))
        except:
            pass
