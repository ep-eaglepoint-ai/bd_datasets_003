# Trajectory

## 1: Identified bottleneck
- The legacy implementation in repository_before/autocomplete.js does a full linear scan of all products on every keystroke.
- For each product it lowercases the name and runs `startsWith` / `includes`.
- It then sorts *all* matches even though only the top 10 are displayed.

Net effect: per keystroke complexity is approximately O(n * L + k log k) where:
- n = number of products (50k–100k)
- L = average product name length
- k = number of matches (can be very large for common prefixes)
This is why typing a multi-character word triggers multiple expensive passes and feels laggy.

## 2: Considered alternatives
- **Plain caching only**: this helps repeated queries but doesn’t solve first-time lookups and doesn’t avoid O(n) work.
- **Binary search on sorted names**: good for prefix-only, but not for substring `includes` matches.
- **Full-text / external libraries**: disallowed.
- **Trie (prefix tree) + lightweight substring accelerator**: best fit for the constraints.

## 3: What changed
Implemented an indexed search engine in repository_after/autocomplete.js:
- A Trie is built once during initialization for prefix matches.
- A trigram -> posting list map to avoid scanning all products for substring matches.
- Top-K selection without sorting all matches.
- Throttle/debounce window (100ms) to coalesce rapid keystrokes and avoid redundant work.
- Incremental updates: `addProduct` and `removeProduct` update the index without a full rebuild.

## 4: Complexity improved
- Index build: O(total characters across names + total unique trigrams).
- Prefix query: O(m + K) where m is query length, K is small top-list size.
- Substring query: O(P + verification) where P is posting list size for the rarest trigram in the query (then exact `includes` verification on candidates).

Critically, i avoid the legacy O(n) scan for every prefix query.

## 5: Memory changed
- Trie stores references(indices), not duplicated product objects.
- Each product contributes roughly one integer reference per character in its name across the trie.
- Trigram index also stores references only, deduped per product per trigram.
This increases memory relative to storing only the raw product array, but keeps it bounded and predictable and trades memory for sub-50ms latency.

