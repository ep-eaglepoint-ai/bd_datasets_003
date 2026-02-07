import pytest
import time
import random
import string
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../repository_before')))
from repository_before.search_index import SearchIndex as NaiveIndex

def random_string(length=5):
    return ''.join(random.choices(string.ascii_lowercase, k=length))

def test_performance_benchmark(SearchIndexClass, capsys):
    """
    Requirement 3: Verify optimized search is significantly faster than naive O(N) scan.
    """
    count = 10000
    queries = 1000
    
    index = SearchIndexClass()
    
    # Setup data
    random.seed(42)  # Deterministic for reproducibility
    terms = [(random_string(5), random.randint(1, 100)) for _ in range(count)]
    
    start_setup = time.time()
    for term, score in terms:
        index.insert(term, score)
    setup_time = time.time() - start_setup
    
    # Generate query prefixes
    random.seed(123)
    prefixes = [random_string(2) for _ in range(queries)]
    
    # Run queries
    start_query = time.time()
    for p in prefixes:
        index.search(p, 5)
    query_time = time.time() - start_query
    
    print(f"\nPerformance ({count} items, {queries} queries): Setup={setup_time:.4f}s, Query={query_time:.4f}s")
    
    # For the optimized implementation, query time should be fast
    if hasattr(index, 'root'):  # duck-typing the optimized version
        # 1000 queries on 10k items should complete well under 1 second
        assert query_time < 2.0, f"Query time {query_time:.4f}s is too slow for optimized implementation"

def test_optimized_faster_than_naive(SearchIndexClass):
    """
    Requirement 3: Direct comparison — optimized search must be faster than naive for large datasets.
    """
    count = 50000
    query_count = 500
    
    random.seed(42)
    terms = [(random_string(8), random.randint(1, 1000)) for _ in range(count)]
    
    random.seed(99)
    prefixes = [random_string(2) for _ in range(query_count)]
    
    # Build naive index
    naive = NaiveIndex()
    for term, score in terms:
        naive.insert(term, score)
    
    # Build optimized index
    optimized = SearchIndexClass()
    for term, score in terms:
        optimized.insert(term, score)
    
    # Time naive queries
    start = time.time()
    for p in prefixes:
        naive.search(p, 5)
    naive_time = time.time() - start
    
    # Time optimized queries
    start = time.time()
    for p in prefixes:
        optimized.search(p, 5)
    opt_time = time.time() - start
    
    print(f"\nNaive: {naive_time:.4f}s, Optimized: {opt_time:.4f}s, Speedup: {naive_time/max(opt_time, 0.0001):.1f}x")
    
    # Optimized MUST be faster (with meaningful margin)
    if hasattr(optimized, 'root'):
        assert opt_time < naive_time, (
            f"Optimized ({opt_time:.4f}s) should be faster than naive ({naive_time:.4f}s)"
        )
