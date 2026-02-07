import pytest

def test_basic_insertion_and_search(SearchIndexClass):
    index = SearchIndexClass()
    index.insert("banana", 50)
    index.insert("band", 30)
    index.insert("apple", 10)
    
    # Exact match
    results = index.search("banana", limit=5)
    assert results == ["banana"]
    
    # Prefix match
    results = index.search("ban", limit=5)
    assert results == ["banana", "band"]
    
    # Limit
    results = index.search("b", limit=1)
    assert results == ["banana"]

def test_score_update(SearchIndexClass):
    index = SearchIndexClass()
    index.insert("foo", 10)
    assert index.search("foo")[0] == "foo"
    
    # Update with higher score
    index.insert("foo", 100)
    # Insert another to check order
    index.insert("fop", 50)
    
    results = index.search("f")
    assert results == ["foo", "fop"]
    
    # Update with LOWER score - tricky case logic check
    index.insert("foo", 5)
    results = index.search("f")
    assert results == ["fop", "foo"]

def test_prefix_miss(SearchIndexClass):
    index = SearchIndexClass()
    index.insert("apple", 10)
    assert index.search("z") == []
    assert index.search("applez") == []

def test_short_prefix(SearchIndexClass):
    index = SearchIndexClass()
    index.insert("a", 10)
    index.insert("ab", 20)
    
    assert index.search("a") == ["ab", "a"]

def test_empty_search(SearchIndexClass):
    index = SearchIndexClass()
    # Empty index, empty prefix → no results
    assert index.search("") == []
    
    # After inserting items, empty prefix returns all (up to limit)
    index.insert("hi", 10)
    assert index.search("") == ["hi"]
    
    # Multiple items with empty prefix, ordered by score descending
    index.insert("world", 50)
    index.insert("zebra", 30)
    results = index.search("", limit=10)
    assert results == ["world", "zebra", "hi"]

def test_edge_cases_scores(SearchIndexClass):
    """
    Reviewer Feedback: Verify behavior with 0 and negative scores.
    """
    index = SearchIndexClass()
    
    # 0 Score
    index.insert("zero", 0)
    assert index.search("zero")[0] == "zero"
    
    # Negative Score
    index.insert("neg", -10)
    index.insert("neg_worse", -20)
    
    # Verify order: -10 > -20
    results = index.search("neg")
    assert results == ["neg", "neg_worse"]
    
    # Mixed positive and negative
    index.insert("pos", 10)
    
    # Search all
    results = index.search("", limit=10)
    # Expected order: pos(10), zero(0), neg(-10), neg_worse(-20)
    assert results == ["pos", "zero", "neg", "neg_worse"]

def test_empty_string_insert(SearchIndexClass):
    """
    Reviewer Feedback: Verify empty string insertion behavior.
    """
    index = SearchIndexClass()
    index.insert("", 100)
    
    # Search "" should return "" as a result if it's in the index?
    # Terms starting with "" includes "" itself.
    results = index.search("", limit=1)
    assert results == [""]
    
    # Search specific prefix shouldn't match "" (unless prefix is empty)
    index.insert("abc", 50)
    results = index.search("a")
    assert results == ["abc"]
    assert "" not in results

def test_case_sensitivity(SearchIndexClass):
    """
    Requirement: Terms are ASCII, case-sensitive.
    'Apple' and 'apple' must be treated as distinct terms.
    """
    index = SearchIndexClass()
    index.insert("Apple", 100)
    index.insert("apple", 50)
    index.insert("APPLE", 200)
    
    # Each is a distinct term
    assert index.search("Apple") == ["Apple"]
    assert index.search("apple") == ["apple"]
    assert index.search("APPLE") == ["APPLE"]
    
    # Prefix 'A' matches 'Apple' and 'APPLE' but NOT 'apple'
    results = index.search("A", limit=10)
    assert "Apple" in results
    assert "APPLE" in results
    assert "apple" not in results
    
    # Prefix 'a' matches 'apple' only
    results = index.search("a", limit=10)
    assert results == ["apple"]
    
    # Ordering by score
    results = index.search("A", limit=10)
    assert results == ["APPLE", "Apple"]

def test_case_sensitive_update(SearchIndexClass):
    """
    Updating 'Apple' should not affect 'apple'.
    """
    index = SearchIndexClass()
    index.insert("apple", 50)
    index.insert("Apple", 10)
    
    # Update 'Apple' score
    index.insert("Apple", 200)
    
    # 'apple' should still have score 50
    results = index.search("", limit=10)
    assert results[0] == "Apple"  # highest score 200
    assert "apple" in results

def test_limit_zero(SearchIndexClass):
    """Edge case: limit=0 should return empty list."""
    index = SearchIndexClass()
    index.insert("foo", 100)
    assert index.search("f", limit=0) == []

def test_single_character_terms(SearchIndexClass):
    """Edge case: single-character terms."""
    index = SearchIndexClass()
    index.insert("a", 10)
    index.insert("b", 20)
    index.insert("c", 30)
    
    assert index.search("a") == ["a"]
    assert index.search("b") == ["b"]
    assert index.search("", limit=3) == ["c", "b", "a"]
