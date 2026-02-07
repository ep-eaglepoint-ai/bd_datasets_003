# Trajectory: Refactoring to Weighted Trie for Typeahead Search

## 1. Code Audit & Bottleneck Detection
The initial `SearchIndex` implementation used a naive O(N) scan for every search request, filtering a flat list of 500,000 terms. This resulted in O(N) latency and O(M log M) sorting cost. Memory usage was inefficient as every term string was stored redundantly. The primary bottleneck was the linear scan and lack of early pruning.

## 2. Performance Contract & SLOs
The goal was to achieve sub-millisecond lookup times. We established a strict requirement for O(L + K) or O(L + log N) complexity. The system also had to operate within a 256MB RAM limit, necessitating a pointer-based Trie structure rather than a flat list or heavy object overhead.

## 3. Data Model Changes: Weighted Trie
We refactored the storage engine from `List[Tuple[int, str]]` to a `TrieNode` graph.
- **Max-Score Caching:** Each node stores the maximum score of its entire subtree (`max_score`). This enables "best-first" traversal.
- **Prefix Path:** Strings are implicitly stored in the path, reducing redundancy compared to storing full strings at every position, although leaf nodes still reference the full term for quick retrieval.

## 4. Query Refactoring: Best-First Search with Pruning
The `search` method was rewritten to use a Priority Queue (Heap).
- Instead of Depth-First Search (DFS) which explores all valid prefixes, we use a Max-Heap initialized with the prefix node's children.
- We aggressively prune branches: if a node's `max_score` is lower than the current K-th best result (conceptually), it is delayed or never visited.
- **Tie-Breaking:** To ensure deterministic behavior (critical for testing), we implemented a comprehensive tie-breaking strategy in the heap using the full path prefix, ensuring strictly alphabetical order for equal scores.

## 5. Verification & Observability
We implemented a property-based fuzz test (`test_fuzz.py`) to compare the optimized Trie implementation against the naive Oracle to guarantee strict behavioral equivalence (correctness). A performance benchmark (`test_performance.py`) verified the speedup.
- **Before:** O(N) scan.
- **After:** ~O(L + K) traversal, depending on score distribution.

## Resource Links
- [Trie Data Structure](https://en.wikipedia.org/wiki/Trie)
- [Radix Tree](https://en.wikipedia.org/wiki/Radix_tree)
- [A* Search Algorithm](https://en.wikipedia.org/wiki/A*_search_algorithm) (similar concept to best-first pruning)
