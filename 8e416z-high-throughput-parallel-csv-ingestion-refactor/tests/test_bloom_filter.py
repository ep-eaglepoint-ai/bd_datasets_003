import unittest
import sys
import os
import threading
import psutil

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../repository_after')))

from bloom_filter import ThreadSafeBloomFilter

class TestBloomFilter(unittest.TestCase):
    """
    Tests for thread-safe Bloom Filter de-duplication.
    EXPECTED TO PASS against repository_after.
    """
    
    def test_duplicate_detection_behavior(self):
        """
        Test that Bloom Filter correctly detects duplicates.
        EXPECTED TO PASS: First occurrence returns False, subsequent returns True.
        """
        bf = ThreadSafeBloomFilter(capacity=1000, error_rate=0.01)
        
        # First time seeing this ID
        is_dup = bf.is_duplicate('tx_001')
        self.assertFalse(is_dup, "First occurrence should return False")
        
        # Second time seeing this ID
        is_dup = bf.is_duplicate('tx_001')
        self.assertTrue(is_dup, "Second occurrence should return True")
        
        # Different ID
        is_dup = bf.is_duplicate('tx_002')
        self.assertFalse(is_dup, "Different ID should return False")
        
        # Same different ID again
        is_dup = bf.is_duplicate('tx_002')
        self.assertTrue(is_dup, "Duplicate of different ID should return True")
    
    def test_memory_remains_bounded(self):
        """
        Test that memory usage remains bounded regardless of dataset size.
        EXPECTED TO PASS: Memory does not grow linearly with number of IDs.
        """
        bf = ThreadSafeBloomFilter(capacity=1_000_000, error_rate=0.001)
        
        process = psutil.Process(os.getpid())
        mem_before = process.memory_info().rss / (1024 * 1024)
        
        # Add 100,000 unique IDs
        for i in range(100_000):
            bf.is_duplicate(f'tx_{i}')
        
        mem_after = process.memory_info().rss / (1024 * 1024)
        mem_growth = mem_after - mem_before
        
        # Memory should not grow significantly (Bloom Filter is fixed size)
        # Allow some growth for Python overhead, but should be < 50MB
        self.assertLess(mem_growth, 50,
            f"Memory grew by {mem_growth:.2f}MB. Bloom Filter should maintain bounded memory.")
    
    def test_thread_safety(self):
        """
        Test that Bloom Filter is safe to use across multiple threads.
        EXPECTED TO PASS: No race conditions when accessed concurrently.
        """
        bf = ThreadSafeBloomFilter(capacity=10000, error_rate=0.01)
        results = []
        errors = []
        
        def worker(thread_id, start, end):
            try:
                for i in range(start, end):
                    tid = f'tx_{i}'
                    is_dup = bf.is_duplicate(tid)
                    results.append((thread_id, tid, is_dup))
            except Exception as e:
                errors.append(e)
        
        # Create 5 threads, each processing different ranges
        threads = []
        for i in range(5):
            start = i * 100
            end = (i + 1) * 100
            t = threading.Thread(target=worker, args=(i, start, end))
            threads.append(t)
            t.start()
        
        for t in threads:
            t.join()
        
        # No errors should occur
        self.assertEqual(len(errors), 0, f"Thread safety errors: {errors}")
        
        # All results should be recorded
        self.assertEqual(len(results), 500, "All 500 operations should complete")
        
        # Verify no duplicate was marked as new on first check
        first_checks = {}
        for thread_id, tid, is_dup in results:
            if tid not in first_checks:
                first_checks[tid] = is_dup
                self.assertFalse(is_dup, 
                    f"First check of {tid} should return False (not duplicate)")
    
    def test_large_dataset_simulation(self):
        """
        Test with a large number of IDs to verify scalability.
        EXPECTED TO PASS: Can handle millions of IDs efficiently.
        """
        bf = ThreadSafeBloomFilter(capacity=10_000_000, error_rate=0.001)
        
        # Add 1 million unique IDs
        duplicates_found = 0
        for i in range(1_000_000):
            if bf.is_duplicate(f'tx_{i}'):
                duplicates_found += 1
        
        # Should have very few false positives (< 0.1% = 1000)
        self.assertLess(duplicates_found, 1000,
            f"Too many false positives: {duplicates_found}")
        
        # Now check for actual duplicates
        duplicates_found = 0
        for i in range(1_000_000):
            if bf.is_duplicate(f'tx_{i}'):
                duplicates_found += 1
        
        # All should be detected as duplicates
        self.assertGreater(duplicates_found, 999_000,
            f"Should detect most duplicates: {duplicates_found}")


if __name__ == '__main__':
    unittest.main()
