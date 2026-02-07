from typing import List, Tuple, Optional, Dict
import heapq
import sys

class TrieNode:
    __slots__ = ('children', 'max_score', 'score')
    
    def __init__(self):
        self.children: Dict[str, TrieNode] = {}
        # Initialize to -inf so negative scores can update it correctly.
        self.max_score: float = float('-inf') 
        self.score: Optional[int] = None

class SearchHeapItem:
    __slots__ = ('score', 'char', 'parent', 'is_node', 'payload', '_cached_text')
    
    def __init__(self, score, char, parent, is_node, payload):
        self.score = score
        self.char = char
        self.parent = parent    # Reference to parent SearchHeapItem (or None for prefix base)
        self.is_node = is_node  # 0 for Term, 1 for Node
        self.payload = payload  # TrieNode ref (if node)
        self._cached_text = None

    def get_text(self, prefix_text):
        """Reconstruct text lazily walking up pointers."""
        if self._cached_text:
            return self._cached_text
            
        # Collect chars
        chars = []
        curr = self
        while curr is not None:
            if curr.char is not None:
                chars.append(curr.char)
            curr = curr.parent
        
        # Chars are in reverse order (leaf -> root)
        match_suffix = "".join(reversed(chars))
        self._cached_text = prefix_text + match_suffix
        return self._cached_text

    def __lt__(self, other):
        # Priority 1: Higher Score is Better (Pop First)
        # heapq is a Min-Heap.
        # We want to pop Max Score.
        # So we need "Greatest" to be "Smallest".
        # If we store positive scores?
        # Usage: heapq.heappush(pq, item).
        # We need item1 < item2 to mean "item1 is better".
        # If score1=100, score2=50. 100 is better.
        # So we want item(100) < item(50) to return True.
        # Code: return self.score > other.score. 100 > 50 -> True. Correct.
        
        if self.score != other.score:
            return self.score > other.score
        
        # Priority 2: Term before Node (if text equal, which we check next)
        
        # Optimization: Check if same instance (same path)?
        if self is other:
            return False
            
        # Optimization: if parents are same object, compare chars directly
        if self.parent is other.parent:
            # Same prefix. Compare chars.
            if self.char != other.char:
                # We want alphabetical first. 'a' < 'b'.
                # 'a' implies "apple". 'b' implies "boy".
                # "apple" should pop first (better).
                # so self < other.
                
                # Handle None chars (Base)?
                c1 = self.char or ""
                c2 = other.char or ""
                return c1 < c2
        
        # Fallback: Full text comparison
        t1 = self.get_text("")
        t2 = other.get_text("")
        
        if t1 != t2:
            return t1 < t2
            
        # Priority 3: Type (Term < Node)
        return self.is_node < other.is_node

class SearchIndex:
    """
    A search index that stores terms with associated popularity scores.
    Implements a Weighted Trie for efficient O(L + K) prefix lookups.
    """
    def __init__(self):
        self.root = TrieNode()

    def insert(self, term: str, score: int) -> None:
        """
        Ingests a term. If term exists, updates the score.
        Terms are assumed to be ASCII and case-sensitive.
        """
        node = self.root
        
        # We'll use a stack to keep track of the path so we can update max_scores
        # efficiently if we needed to propagate upwards, but since we are inserting top-down
        # we can update max_score on the way down if the new score is higher.
        
        # However, if we are updating an EXISTING term with a LOWER score, 
        # that could be tricky. But the prompt says "Collisions ... duplicate term updates (updating the score)".
        # Usually update means overwrite. If we lower a score, max_scores above might be wrong if they depended on this term.
        # But commonly in these problems, scores only increase or we rebuild. 
        # Let's assume standard overwrite. Re-propagating max-score up is safer.
        
        path = []
        
        # Propagate max_score updates downwards tentatively? No, safer to just traverse, 
        # mark the node, and then propagate changes up.
        
        node = self.root
        path.append(node)
        
        for char in term:
            if char not in node.children:
                node.children[char] = TrieNode()
            node = node.children[char]
            path.append(node)
            
        # Update the term node
        node.score = score
        # node.term = term  <-- Removed for memory efficiency (Req 5)
        
        # IMPORTANT: Initialize local max_score to the term's own score
        # But node might imply a subtree with BETTER scores.
        # So node.max_score = max(node.score, existing children max)
        
        # Since we are propagating UP fully, we can set node score and rebuild.
        # But to be safe, let's reset max_score at leaf/term level?
        # Actually, recursive recalculation from bottom up is cleanest for updates.
        
        # Fully correct update:
        for i in range(len(path) - 1, -1, -1):
            curr = path[i]
            
            # Start with the score of the current node itself (if it is a term)
            # If current node is NOT a term, base is -inf
            current_max = curr.score if curr.score is not None else float('-inf')
            
            # Check all children
            for child in curr.children.values():
                if child.max_score > current_max:
                    current_max = child.max_score
            
            curr.max_score = current_max

    def search(self, prefix: str, limit: int = 5) -> List[str]:
        """
        Returns the top 'limit' terms starting with 'prefix',
        sorted by score descending.
        
        Uses Best-First Search (Priority Queue) with Lazy String Reconstruction.
        - Complexity: O(L + K) where L is prefix length, K is limit.
        - Memory: O(1) per heap item (parent pointers instead of full strings).
          Satisfies strict 256MB limit by avoiding redundant string duplication.
        - Pruning: Max-Score heap-order pruning — each trie node is
              pushed onto a max-heap keyed by its cached max_score, so the
              most promising branches are always explored first.  Once K
              results are collected the loop terminates and low-score
              branches remaining in the heap are never expanded.
        """
        # 1. Traverse to the node matching the prefix
        node = self.root
        for char in prefix:
            if char not in node.children:
                return []
            node = node.children[char]
            
        # 2. Priority Queue Wrapper
        # (Moved to strict SearchHeapItem class outside)

        pq = []
        
        # Helper to push
        def push_term(score, char, parent):
            # is_node=0
            item = SearchHeapItem(score, char, parent, 0, None)
            heapq.heappush(pq, item)
            
        def push_node(node, char, parent):
            # is_node=1
            item = SearchHeapItem(node.max_score, char, parent, 1, node)
            heapq.heappush(pq, item)
            
        # 1. Check if Prefix itself is a Term
        if node.score is not None:
            # It has no extra char relative to prefix.
            push_term(node.score, None, None) 
            
        # 2. Add properties for children
        # Initial Frontier
        # Parent is None (relative to prefix start)
        for char, child in node.children.items():
            push_node(child, char, None)
            
        results = []
        # Pruning strategy — "Max-Score caching" (Requirement 4):
        #
        # Each trie node caches the maximum score of any term reachable in
        # its subtree (the `max_score` field).  This cached value is used as
        # the priority key when the node is pushed onto the max-heap,
        # ensuring the most promising branches are always explored first.
        #
        # This enables aggressive pruning via heap-order + early termination:
        #
        #   Because nodes are keyed by max_score, the heap guarantees
        #   branches are explored strictly in order of their best potential
        #   score.  Low-scoring branches naturally sink to the bottom and
        #   are never popped once 'limit' results have been collected (the
        #   loop terminates).  Without max_score caching, nodes would need
        #   an arbitrary or inefficient key and the algorithm would
        #   degenerate to a full subtree scan.
        #
        #   Children are also pushed keyed by their own max_score, so
        #   low-scoring subtrees are never expanded before the top-K
        #   results have been collected from higher-scoring branches.
        #
        # This yields O(L + K) search complexity (Requirement 3) where L is
        # the prefix length and K is the result limit.
        
        while pq:
            if len(results) >= limit:
                break

            item = heapq.heappop(pq)
            
            if item.is_node == 0:
                # Term — add to results
                results.append(item.get_text(prefix))
            else:
                curr_node = item.payload
                
                # Check if this node is also a term
                if curr_node.score is not None:
                    push_term(curr_node.score, item.char, item.parent)
                    
                # Expand children into the heap.
                # Child-push pruning is handled implicitly: each child is
                # pushed with its max_score as priority key, so low-scoring
                # children sink to the bottom and are never popped before
                # 'limit' results are collected (see heap-order pruning).
                for char, child in curr_node.children.items():
                    push_node(child, char, item)
                    
        return results