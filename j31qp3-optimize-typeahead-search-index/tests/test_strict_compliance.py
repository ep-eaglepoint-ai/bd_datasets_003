import pytest
import sys
import os
import heapq
import unittest
from unittest.mock import MagicMock, PropertyMock, patch

# Inject path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../repository_after')))
from search_index import SearchIndex, TrieNode

def test_strict_pruning_behavior():
    """
    Requirement 3 & 4: Strict verification that aggressive pruning occurs.
    
    The max_score caching at each node combined with a max-heap ensures that
    the most promising branches are explored first.  Low-scoring branches
    never get popped before the Top-K results are collected, so their
    children are never expanded.
    
    We verify this by instrumenting children dicts to count .items() calls
    and confirming low-score branches are never accessed.
    """
    index = SearchIndex()
    
    # High-score terms
    index.insert("H", 100)
    index.insert("M", 50)
    
    # Low-score branch with deep subtree
    index.insert("La", 1)
    index.insert("Lb", 1)
    index.insert("Lc", 1)
    
    class CountingDict(dict):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self.access_count = 0
        def items(self):
            self.access_count += 1
            return super().items()
    
    # Instrument 'L' node's children
    l_node = index.root.children['L']
    wrapped = CountingDict(l_node.children)
    l_node.children = wrapped
    
    results = index.search("", limit=2)
    assert results == ["H", "M"]
    
    # L.max_score=1, which is far below H(100) and M(50).
    # The heap-order pruning ensures L is never popped because the loop
    # terminates after collecting 2 results from the higher-scoring branches.
    # Therefore L's children should NEVER be accessed.
    assert wrapped.access_count == 0, (
        f"Low-score 'L' branch children accessed {wrapped.access_count} times. "
        "Max-score heap-order pruning should prevent expanding low-score branches."
    )


def test_strict_pruning_verified():
    """
    Requirement 3 & 4: Verify that low-score branches are never expanded
    when sufficient high-score results exist.
    
    We instrument children dicts to count .items() calls and verify
    low-score branches are not expanded.
    """
    index = SearchIndex()
    
    # Build: 'a'(score=100), 'b'(score=90), 'z' prefix with 50 low-score terms
    index.insert("a", 100)
    index.insert("b", 90)
    for i in range(50):
        index.insert(f"z{i}", 1)
    
    # Instrument 'z' node
    class CountingDict(dict):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self.access_count = 0
        def items(self):
            self.access_count += 1
            return super().items()
    
    z_node = index.root.children['z']
    wrapped = CountingDict(z_node.children)
    z_node.children = wrapped
    
    results = index.search("", limit=2)
    assert results == ["a", "b"]
    
    # 'z' branch (max_score=1) should never be expanded because:
    # - With early termination: we find 2 results and break before popping 'z'
    # - With pruning: even if popped, max_score=1 < cutoff=90 → skip
    # Either way, z's children should not be accessed.
    assert wrapped.access_count == 0, (
        f"Low-score 'z' branch expanded {wrapped.access_count} times! "
        "Branch should be skipped (either by early termination or pruning)."
    )

def test_memory_strictness():
    """
    Requirement 5: Verify strict memory handling.
    """
    node = TrieNode()
    try:
        node.term = "fail"
        assert False, "Should not be able to set 'term' attribute on TrieNode (Requirements 5)"
    except AttributeError:
        pass # Expected
    except Exception as e:
        assert False, f"Unexpected error: {e}"

def test_update_invariants():
    """
    Requirement 2: explicit verification of update behavior (no duplicates, correct score propagation).
    """
    index = SearchIndex()
    
    # 1. Insert "cat" (50)
    index.insert("cat", 50)
    
    # helper to count distinct nodes
    def count_nodes(node):
        count = 1 # self
        for child in node.children.values():
            count += count_nodes(child)
        return count

    # Root -> c -> a -> t. (4 nodes)
    initial_count = count_nodes(index.root)
    assert initial_count == 4
    
    # Verify max_score at root
    # root.max_score should be 50
    assert index.root.max_score == 50
    
    # 2. Update "cat" (100) - Higher Score
    index.insert("cat", 100)
    
    # Node count MUST be identical (Implicit uniqueness of Trie path)
    assert count_nodes(index.root) == 4
    
    # Score MUST be updated
    node = index.root.children['c'].children['a'].children['t']
    assert node.score == 100
    
    # Max Score MUST propagate up
    assert index.root.max_score == 100
    
    # 3. Update "cat" (10) - Lower Score
    # This requires re-evaluating children max_scores.
    index.insert("cat", 10)
    
    assert count_nodes(index.root) == 4
    assert node.score == 10
    assert index.root.max_score == 10
    
    # 4. Collision/Branching
    # Insert "cap" (80)
    # Root -> c -> a -> t(10)
    #               -> p(80)
    index.insert("cap", 80)
    
    # Root max_score should be 80 ("cap" > "cat")
    assert index.root.max_score == 80
    
    # Verify structure: 'a' has 2 children
    a_node = index.root.children['c'].children['a']
    assert len(a_node.children) == 2
    assert a_node.max_score == 80 # max(10, 80)

def test_equality_pruning_strict():
    """
    Requirement 4 Edge Case: Pruning when scores are EQUAL but path is alphabetically worse.
    """
    index = SearchIndex()
    
    # 1. "apple" (10)
    # 2. "boy" (10)
    # 3. "cat" (10)
    
    # We construct manually to control execution order/mocking
    # Root children: 'a', 'b'. 
    # 'a' -> "apple" (10)
    # 'b' -> "boy" (10)
    
    a_node = TrieNode()
    a_node.score = 10
    a_node.max_score = 10
    
    # We need a proper term 'apple' under 'a' to form the candidate.
    # Actually, we can just treat 'a' as the term "a"(10) for simplicity of test,
    # as long as "b" > "a".
    # Let's say Term "a" (10).
    a_node.score = 10
    
    b_node = TrieNode()
    b_node.score = None # 'b' itself is not a term, it has children
    b_node.max_score = 10
    
    mock_b_children = MagicMock()
    b_node.children = mock_b_children
    
    index.root.children['a'] = a_node
    index.root.children['b'] = b_node
    
    # Search limit=1.
    # Should find 'a'. Cutoff becomes ("a", 10).
    # Then visit 'b'.
    # b.max_score (10) == cutoff.score (10).
    # Path "b" > "a".
    # Should PRUNE.
    
    results = index.search("", limit=1)
    
    assert results == ["a"]
    
    # Verify 'b' children were NOT accessed
    mock_b_children.items.assert_not_called()
    print("\n✅ Equality Pruning verified: 'b' branch pruned because 'b' > 'a' with equal score.")

def test_complexity_bound():
    """
    Requirement 3 Verification: O(L + K) complexity check.
    We instrument the Trie to count strictly how many nodes are EXPANDED (children accessed).
    
    Setup:
    - Root
      -> 'a' (Score 10, deep subtree of 100 nodes)
      -> 'b' (Score 20, is a term)
      -> 'c' (Score 30, is a term)
      -> 'd' (Score 5, deep subtree of 100 nodes)
      
    Search limit=2.
    Expected:
    - Must verify 'c' (30) -> 1st result.
    - Must verify 'b' (20) -> 2nd result.
    - STOP.
    
    Should NOT expand 'a' (10) subtree or 'd' (5) subtree.
    Total Expansions:
    1. Root (to find a,b,c,d)
    2. 'c' (to Confirm/Push children - if it's a node-term)
    3. 'b' (to Confirm/Push children)
    
    Branches 'a' and 'd' might be in the PQ, but POPS should be restricted.
    Access to 'a.children' or 'd.children' happens ONLY if they are popped.
    Since 'c' and 'b' have higher scores, 'a' and 'd' should not be popped before limit is reached.
    """
    index = SearchIndex()
    
    # 1. Build the Data
    # 'c' - score 30
    index.insert("c", 30)
    # 'b' - score 20
    index.insert("b", 20)
    
    # 'a' - score 10, deep subtree
    # We add 100 terms starting with 'a'
    for i in range(100):
        index.insert(f"a{i}", 10) # Max score of 'a' branch is 10
        
    # 'd' - score 5, deep subtree
    for i in range(100):
        index.insert(f"d{i}", 5)
        
    # Instrument the Trie
    # We wrap EVERY `children` dict in a wrapper that counts `items()` calls.
    
    class CountingDict(dict):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self.access_count = 0
            
        def items(self):
            self.access_count += 1
            return super().items()

    total_expansions = 0
    
    def instrument_node(node):
        # Wrap current node's children
        wrapped = CountingDict(node.children)
        node.children = wrapped
        
        # Recursively instrument
        for child in wrapped.values():
            instrument_node(child)
            
    instrument_node(index.root)
    
    # reset counts (insertions might have triggered some? No, we just wrapped)
    # Actually insert touches items. But we wrap AFTER insert.
    
    # SEARCH
    # limit=2. Expect to find "c", "b".
    results = index.search("", limit=2)
    
    assert results == ["c", "b"]
    
    # COLLECT STATS
    # Traverse and sum accesses
    def collect_accesses(node):
        count = 0
        if isinstance(node.children, CountingDict):
            count += node.children.access_count
        for child in node.children.values():
            count += collect_accesses(child)
        return count
        
    total_expansions = collect_accesses(index.root)
    
    print(f"\nTotal Node Expansions for Limit=2: {total_expansions}")
    
    # Analysis:
    # 1. Root expansion -> Pushes 'a', 'b', 'c', 'd'. (Access = 1)
    # 2. PQ Pop 'c' (30). 
    #    'c' is a Node-Term. We check its children (empty). (Access = 1) -> Result 1
    # 3. PQ Pop 'b' (20).
    #    'b' is a Node-Term. We check its children (empty). (Access = 1) -> Result 2
    # Limit reached. Break.
    
    # 'a' path (score 10) is in PQ but never popped. 'a.children' should NOT be accessed.
    # 'd' path (score 5) is in PQ but never popped.
    
    # Expected Total: 3.
    # Allow small margin for implementation details (e.g. prefix traversal itself?)
    # Prefix "" -> root.
    
    # Strict assertions
    assert total_expansions <= 5, f"Too many expansions ({total_expansions})! O(L+K) violation."
    
    # Verify strict non-access of pruned branches
    # Get node 'a'
    # We must traverse carefully because we wrapped the dicts
    root_dict = index.root.children
    a_node = root_dict['a']
    assert isinstance(a_node.children, CountingDict)
    assert a_node.children.access_count == 0, "Optimized search improperly expanded low-score branch 'a'!"



    # Verify strict non-access of pruned branches
    # Get node 'a'
    # We must traverse carefully because we wrapped the dicts
    root_dict = index.root.children
    a_node = root_dict['a']
    assert isinstance(a_node.children, CountingDict)
    assert a_node.children.access_count == 0, "Optimized search improperly expanded low-score branch 'a'!"

def test_heap_memory_optimization():
    """
    Requirement 5 Verification: Confirm SearchHeapItem does not store redundant deep strings.
    """
    from search_index import SearchHeapItem
    index = SearchIndex()
    
    # Insert a very long term
    long_term = "a" * 1000
    index.insert(long_term, 100)
    
    # We want to intercept the SearchHeapItems pushed to PQ
    # We can mock heapq.heappush
    captured_items = []
    
    original_heappush = heapq.heappush
    def mock_heappush(heap, item):
        captured_items.append(item)
        original_heappush(heap, item)
        
    with unittest.mock.patch('heapq.heappush', side_effect=mock_heappush):
        index.search("a", limit=1)
        
    # Validation
    # We expect items to be pushed.
    # At least some items should represent nodes/terms in that deep chain.
    # We check the LAST pushed item (deepest).
    
    assert len(captured_items) > 0, "No items pushed to heap?"
    
    deep_item = captured_items[-1]
    
    # Verify strict class usage
    assert isinstance(deep_item, SearchHeapItem)
    
    # Verify NO FULL STRING STORAGE
    # The 'char' attribute should be a single character 'a' or None
    if deep_item.char:
        assert len(deep_item.char) == 1, f"SearchHeapItem stores full string! {len(deep_item.char)} chars."
        
    # Verify cached text is initially None (Lazy)
    # Note: search() might consume/call get_text() for the result we return.
    # But captured_items contains items pushed *before* popping.
    # The item pushed at the bottom of expansion shouldn't have been popped (and thus resolved) yet 
    # if we just pushed it.
    
    # Actually, the last item pushed might be popped immediately if it is the best.
    # But checking internal structure: 'parent' pointer logic.
    
    assert hasattr(deep_item, 'parent'), "No parent pointer found?"
    
    # Assert size is small (sanity check)
    # sys.getsizeof(deep_item) for a __slots__ class is small (e.g. 48-80 bytes)
    # If it stored 1000 chars, it would be larger.
    # But 'char' is a reference. 1000 char string exists in memory ONCE (in the term we created).
    # The KEY is that the item doesn't duplicate it.
    
    # Check that 'char' is not equal to 'long_term'
    assert deep_item.char != long_term, "Item stores explicit long string copy!"
    
    print(f"\n✅ Memory Optimization verified: SearchHeapItem uses pointers, not deep strings.")
