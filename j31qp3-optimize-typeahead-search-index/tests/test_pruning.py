import pytest
import sys
import os
import heapq

# Ensure we test the repository_after implementation
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../repository_after')))

from search_index import SearchIndex, TrieNode

class InstrumentedTestIndex(SearchIndex):
    def __init__(self):
        super().__init__()
        self.nodes_visited = 0
        
    def search(self, prefix: str, limit: int = 5):
        pass

def test_max_score_propagation():
    index = SearchIndex()
    index.insert("apple", 10)
    index.insert("apricot", 20)
    index.insert("application", 5)
    
    # Root->a->p should have max_score 20
    node = index.root.children['a'].children['p']
    assert node.max_score == 20
    
    # Root->a->p->p should have max_score 10 (apple=10 > application=5)
    pp_node = node.children['p']
    assert pp_node.max_score == 10
    
    # Update apricot to 1
    index.insert("apricot", 1)
    # Now Root->a->p max_score should be 10 (from apple)
    node = index.root.children['a'].children['p']
    assert node.max_score == 10, "Max score should update downwards on re-insert"

def test_pruning_logic_via_ordering():
    """
    Requirement 3/4: Search should prioritize high scores.
    We verify this by ensuring we get the TOP k results, not just ANY k results.
    """
    index = SearchIndex()
    
    index.insert("a", 100)
    index.insert("ab", 90)
    index.insert("abc", 80)
    
    # Low score items
    index.insert("az", 1)
    index.insert("ay", 2)
    index.insert("ax", 3)
    
    results = index.search("a", limit=3)
    assert results == ["a", "ab", "abc"]
    
    # Deep high score beats shallow low score
    index = SearchIndex()
    index.insert("a" * 50, 1000)
    index.insert("b", 1)
    
    res = index.search("", limit=1)
    assert res == ["a" * 50]

def test_explicit_pruning_skips_low_branches():
    """
    Requirement 4: Verify that once K results are collected, branches with
    max_score < worst result score are explicitly pruned (skipped).
    
    This test creates a scenario where the loop CONTINUES past collecting K
    results, and a low-score node is popped but must be pruned.
    """
    index = SearchIndex()
    
    # Create structure:
    index.insert("a", 50)
    index.insert("aa", 49)
    index.insert("ab", 48)
    index.insert("b", 47)
    
    # Large low-score subtree under 'z'
    for i in range(100):
        index.insert(f"z{chr(97 + (i % 26))}{i}", 1)
    
    # Instrument 'z' subtree to count expansions
    class CountingDict(dict):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self.access_count = 0
        def items(self):
            self.access_count += 1
            return super().items()
    
    # Find 'z' node and wrap its children
    z_node = index.root.children['z']
    original_z_children = z_node.children
    
    # First wrap deeper children (before wrapping z_node itself)
    def wrap_children_recursive(node):
        for key, child in list(node.children.items()):
            if not isinstance(child.children, CountingDict):
                child.children = CountingDict(child.children)
            wrap_children_recursive(child)
    wrap_children_recursive(z_node)
    
    # Now wrap z_node's children (counter starts at 0)
    wrapped_z = CountingDict(z_node.children)
    z_node.children = wrapped_z
    
    results = index.search("", limit=3)
    
    # Top 3 by score: a(50), aa(49), ab(48)
    assert results == ["a", "aa", "ab"]
    
    # 'z' subtree should NOT have been expanded because z.max_score (1) < cutoff (48)
    assert wrapped_z.access_count == 0, (
        f"'z' subtree was expanded {wrapped_z.access_count} times despite max_score=1 < cutoff=48. "
        "Explicit pruning is not working!"
    )

def test_max_score_propagation_on_score_decrease():
    """
    Requirement 2 & 4: When a term's score decreases, max_score must be
    correctly re-computed up the path (not just taking the max of old values).
    """
    index = SearchIndex()
    index.insert("abc", 100)
    index.insert("abd", 50)
    
    # Root -> a -> b has max_score 100
    ab_node = index.root.children['a'].children['b']
    assert ab_node.max_score == 100
    
    # Decrease abc's score to 10
    index.insert("abc", 10)
    
    # Now max_score should be 50 (from abd), not 100
    assert ab_node.max_score == 50, "max_score must decrease when the dominant term's score drops"
    assert index.root.max_score == 50

def test_pruning_with_many_equal_scores():
    """
    Edge case: many branches with the same score.
    Pruning should NOT skip branches whose max_score equals the cutoff
    (they might still produce valid results).
    """
    index = SearchIndex()
    
    # All terms have the same score
    for ch in "abcdefghij":
        index.insert(ch, 50)
    
    # Request all of them
    results = index.search("", limit=10)
    assert len(results) == 10
    assert set(results) == set("abcdefghij")
    
    # Request fewer — should get alphabetically first (tiebreaker)
    results = index.search("", limit=3)
    assert len(results) == 3
    assert results == ["a", "b", "c"]
