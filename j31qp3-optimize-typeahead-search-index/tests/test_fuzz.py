import pytest
import sys
import os
from hypothesis import given, settings, strategies as st

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../repository_after')))
from search_index import SearchIndex as OptimizedIndex

try:
    from repository_before.search_index import SearchIndex as NaiveIndex
except ImportError:
    sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../repository_before')))
    from repository_before.search_index import SearchIndex as NaiveIndex

@settings(max_examples=100, deadline=None)
@given(
    st.lists(
        st.tuples(
            st.text(alphabet=st.characters(whitelist_categories=('L', 'N'), whitelist_characters='_'), min_size=0, max_size=10), 
            st.integers(min_value=-1000, max_value=1000)
        ), 
        min_size=1, max_size=100
    ),
    st.lists(
        st.tuples(
            st.text(alphabet=st.characters(whitelist_categories=('L', 'N'), whitelist_characters='_'), min_size=0, max_size=3),
            st.integers(min_value=1, max_value=10)
        ), 
        min_size=1, max_size=20
    )
)
def test_hypothesis_comparison(operations, searches):
    """
    Requirement 7: Property-based test comparison against naive implementation using Hypothesis.
    """
    optimized = OptimizedIndex()
    naive = NaiveIndex()
    
    truth_data = {}
    
    for term, score in operations:
        optimized.insert(term, score)
        naive.insert(term, score)
        truth_data[term] = score

    for prefix, limit in searches:
        res_opt = optimized.search(prefix, limit)
        res_naive = naive.search(prefix, limit)
        
        # Verify Optimized against Truth (Absolute Correctness)
        matches = [(s, t) for t, s in truth_data.items() if t.startswith(prefix)]
        matches.sort(key=lambda x: (-x[0], x[1]))
        expected = [t for s, t in matches[:limit]]
        assert res_opt == expected, f"Optimized mismatch for '{prefix}'"
        
        naive_all = naive.search(prefix, limit=1000) # Get ample results
        
        # Deduplicate (Keep First = Keep Best Score)
        naive_unique = list(dict.fromkeys(naive_all))
        
        
        naive_sorted = sorted(naive_unique, key=lambda t: (-truth_data[t], t))
        
        naive_expected = naive_sorted[:limit]
        
        assert res_opt == naive_expected, (
            f"Optimized does not match Naive (normalized for deterministic tie-breaking).\n"
            f"Opt: {res_opt}\n"
            f"Naive (Stable): {naive_unique[:limit]}\n"
            f"Naive (Sorted): {naive_expected}"
        )

def test_duplicate_updates_match_oracle():
    """
    Requirement 2 coverage again, explicit simple case.
    """
    optimized = OptimizedIndex()
    optimized.insert("foo", 10)
    optimized.insert("foo", 20)
    assert optimized.search("foo") == ["foo"]
    
    optimized.insert("bar", 15)
    results = optimized.search("b") 
    assert "bar" in results
    
    all_res = optimized.search("", 10)
    assert "foo" in all_res
    assert "bar" in all_res
