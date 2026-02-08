import threading
from pybloom_live import BloomFilter

class ThreadSafeBloomFilter:
    """
    Thread-safe Bloom Filter for detecting duplicate transaction IDs.
    
    Uses an approximate membership structure to identify duplicates without
    storing all IDs in memory. Safe for 100 million+ records.
    """
    
    def __init__(self, capacity=100_000_000, error_rate=0.001):
        """
        Initialize the Bloom Filter.
        
        Args:
            capacity: Expected number of elements (default: 100 million)
            error_rate: False positive probability (default: 0.1%)
        """
        self.bloom_filter = BloomFilter(capacity=capacity, error_rate=error_rate)
        self.lock = threading.Lock()
    
    def is_duplicate(self, transaction_id):
        """
        Check if a transaction ID is likely a duplicate.
        
        Args:
            transaction_id: The transaction ID to check
            
        Returns:
            True if the ID is likely a duplicate (already seen)
            False if the ID is new (and records it)
        """
        with self.lock:
            if transaction_id in self.bloom_filter:
                return True
            else:
                self.bloom_filter.add(transaction_id)
                return False
