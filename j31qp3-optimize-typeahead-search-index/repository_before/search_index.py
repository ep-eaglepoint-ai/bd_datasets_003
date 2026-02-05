# filename: search_index.py
from typing import List, Tuple, Optional
import heapq

class SearchIndex:
    """
    A search index that stores terms with associated popularity scores.
    Currently implements a naive O(N) scan.
    """
    def __init__(self):
        # Term structure: (score, term_string)
        self.data: List[Tuple[int, str]] = []

    def insert(self, term: str, score: int) -> None:
        """
        Ingests a term. If term exists, updates the score.
        Assume terms are ASCII for simplicity, but case-sensitive.
        """
        # Naive implementation allows duplicates or requires linear scan to update
        self.data.append((score, term))

    def search(self, prefix: str, limit: int = 5) -> List[str]:
        """
        Returns the top 'limit' terms starting with 'prefix',
        sorted by score descending.
        """
        # O(N) scan - causing high latency
        matches = [
            (score, term) 
            for score, term in self.data 
            if term.startswith(prefix)
        ]
        # O(M log M) sort where M is match count
        matches.sort(key=lambda x: x[0], reverse=True)
        
        return [term for _, term in matches[:limit]]

# Example usage for context
# index = SearchIndex()
# index.insert("banana", 50)
# index.insert("band", 30)
# index.insert("apple", 10)
# print(index.search("ban", 1)) -> ["banana"]"