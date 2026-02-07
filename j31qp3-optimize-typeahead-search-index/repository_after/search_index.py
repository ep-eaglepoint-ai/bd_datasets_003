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
        for char, child in node.children.items():
            push_node(child, char, None)
            
        results = []
        
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
                    
                for char, child in curr_node.children.items():
                    push_node(child, char, item)
                    
        return results