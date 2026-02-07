import pytest
import sys
import os

# Ensure we test the repository_after implementation
# We modify sys.path to prioritize repository_after
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../repository_after')))

from search_index import TrieNode, SearchIndex

def test_trienode_structure_memory():
    """
    Requirement 5: Memory efficient; avoid storing redundant strings.
    Verify that TrieNode does NOT store the 'term' attribute.
    """
    node = TrieNode()
    
    # Check for presence of 'term' attribute
    assert not hasattr(node, 'term'), "TrieNode should not store 'term' attribute to be memory efficient"
    
    # Verify slots usage for memory optimization
    assert hasattr(TrieNode, '__slots__'), "TrieNode should use __slots__ for memory efficiency"
    assert 'term' not in TrieNode.__slots__, "__slots__ should not contain 'term'"
    assert 'max_score' in TrieNode.__slots__, "__slots__ should contain 'max_score'"

def test_reconstruction_works():
    """
    Verify that search still works even without term storage (reconstruction logic).
    """
    index = SearchIndex()
    index.insert("apple", 10)
    
    # Access the node for 'apple'
    node = index.root.children['a'].children['p'].children['p'].children['l'].children['e']
    
    # It should have score but NO term string
    assert node.score == 10
    assert not hasattr(node, 'term')
    
    # Search should still return the full string
    results = index.search("a")
    assert results == ["apple"]
