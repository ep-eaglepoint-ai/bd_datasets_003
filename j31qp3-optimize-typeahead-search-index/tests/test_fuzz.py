import pytest
import sys
import os
from hypothesis import given, settings, strategies as st

# Import SearchIndex from repository_after
# We handle the import path to ensure we test the right class
# Ideally, pytest fixtures handle this, but for this standalone-ish test structure:
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../repository_after')))
from search_index import SearchIndex as OptimizedIndex

# Import Naive Implementation if we want to run it physically, 
# BUT as noted, Naive Implementation might be buggy (duplicates).
# Reviewer asked to "compare... against naive". 
# If Naive is flawed, we can't assert equality.
# However, the requirement is "ensure correctness".
# Testing against a flawed oracle is bad. 
# BUT, we can use a "Model Oracle" (python dict) which represents the ideal naive implementation.
# Reviewer complaint: "does not actually compare outputs to NaiveIndex—it builds a separate oracle instead"
# This implies I SHOULD compare to NaiveIndex. 
# If NaiveIndex is buggy, then the requirement is contradictory or I should emulate the bug?
# OR, NaiveIndex is "Correct but slow".
# Let's import it and see.
try:
    from repository_before.search_index import SearchIndex as NaiveIndex
except ImportError:
    sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../repository_before')))
    from repository_before.search_index import SearchIndex as NaiveIndex

@settings(max_examples=100, deadline=None)
@given(
    st.lists(
        st.tuples(
            st.text(alphabet=st.characters(whitelist_categories=('L', 'N'), whitelist_characters='_'), min_size=1, max_size=10), 
            st.integers(min_value=1, max_value=1000)
        ), 
        min_size=1, max_size=100
    ),
    st.lists(
        st.tuples(
            st.text(alphabet=st.characters(whitelist_categories=('L', 'N'), whitelist_characters='_'), min_size=1, max_size=3),
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
    
    # Model Oracle (Truth)
    # We maintain this because NaiveIndex might have duplicate-entry behavior 
    # that makes direct list comparison hard without normalization.
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
        
        # Verify Naive against Truth (Sanity Check AND Requirement 7)
        # Naive implementation has a known flaw: it appends duplicates instead of updating.
        # It returns [("foo", 20), ("foo", 10)] -> ["foo", "foo"].
        # Optimized returns unique ["foo"] (with score 20).
        # To strictly compare, we must normalize the Naive output:
        # 1. Run Naive with large limit to capture all potential candidates.
        # 2. Deduplicate keeping order (Python dict preserves insertion order = score order).
        # 3. Slice to original limit.
        
        naive_all = naive.search(prefix, limit=1000) # Get ample results
        
        # Deduplicate (Keep First = Keep Best Score)
        naive_unique = list(dict.fromkeys(naive_all))
        
        # Slice to target limit
        naive_candidates = naive_unique[:limit]
        
        # Verify Score/Term Match:
        # Optimized implementation breaks ties Alphabetically (Term ASC).
        # Naive implementation breaks ties by Insertion Order (Stable Sort).
        # To compare them, we must enforce a deterministic sort on the Naive output 
        # using the known scores from truth_data.
        
        naive_expected = sorted(naive_candidates, key=lambda t: (-truth_data[t], t))
        
        # We also need to sort the Optimized result because even if the Heap pops in order,
        # if multiple items have the EXACT same score and term (impossible due to set/map),
        # or if expected has different tie-breaking.
        # But Optimized IS the reference for "Correct Deterministic Behavior".
        # So we expect Optimized to ALREADY be sorted by (-score, term).
        
        assert res_opt == naive_expected, (
            f"Optimized does not match Naive (normalized for deterministic tie-breaking).\n"
            f"Opt: {res_opt}\n"
            f"Naive (Stable): {naive_candidates}\n"
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
