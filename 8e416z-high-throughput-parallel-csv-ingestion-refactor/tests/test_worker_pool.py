import unittest
import sys
import os
import threading
import time

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../repository_after')))

from worker_pool import WorkerPool, validate_and_transform_row

class TestWorkerPool(unittest.TestCase):
    """
    Tests for parallel worker pool.
    EXPECTED TO PASS against repository_after.
    """
    
    def test_multiple_workers_used(self):
        """
        Test that multiple worker threads are created and used.
        EXPECTED TO PASS: Thread count increases during processing.
        """
        pool = WorkerPool(max_workers=4)
        
        # Create test data
        rows = [(i, {'transaction_id': f'tx_{i}', 'amount': '100', 'date': '2023-01-01'}) 
                for i in range(20)]
        
        initial_thread_count = threading.active_count()
        
        # Track max thread count during processing
        max_threads = initial_thread_count
        
        def slow_process(line_num, row):
            nonlocal max_threads
            current = threading.active_count()
            max_threads = max(max_threads, current)
            time.sleep(0.01)  # Small delay to ensure threads overlap
            return validate_and_transform_row(line_num, row)
        
        results = pool.process_rows(rows, slow_process)
        
        # Should have created additional threads
        self.assertGreater(max_threads, initial_thread_count,
            f"Expected more threads. Initial: {initial_thread_count}, Max: {max_threads}")
    
    def test_correct_processing_results(self):
        """
        Test that all rows are processed correctly.
        EXPECTED TO PASS: All valid rows are transformed correctly.
        """
        pool = WorkerPool(max_workers=4)
        
        # Create test data with some invalid rows
        rows = [
            (1, {'transaction_id': 'tx_1', 'amount': '100.50', 'date': '2023-01-01'}),
            (2, {'transaction_id': '', 'amount': '200', 'date': '2023-01-02'}),  # Invalid
            (3, {'transaction_id': 'tx_3', 'amount': '300.75', 'date': '2023-01-03'}),
            (4, {'transaction_id': 'tx_4', 'amount': 'INVALID', 'date': '2023-01-04'}),  # Invalid
            (5, {'transaction_id': 'tx_5', 'amount': '500', 'date': '2023-01-05'}),
        ]
        
        results = pool.process_rows(rows, validate_and_transform_row)
        
        # Should have 3 valid results (rows 1, 3, 5)
        self.assertEqual(len(results), 3, f"Expected 3 valid results, got {len(results)}")
        
        # Verify correct transformation
        self.assertEqual(results[0][1]['transaction_id'], 'tx_1')
        self.assertEqual(results[0][1]['amount'], 100.50)
        
        self.assertEqual(results[1][1]['transaction_id'], 'tx_3')
        self.assertEqual(results[1][1]['amount'], 300.75)
        
        self.assertEqual(results[2][1]['transaction_id'], 'tx_5')
        self.assertEqual(results[2][1]['amount'], 500.0)
    
    def test_deterministic_output(self):
        """
        Test that output order is deterministic (sorted by line number).
        EXPECTED TO PASS: Results are always in the same order.
        """
        pool = WorkerPool(max_workers=4)
        
        # Create test data
        rows = [(i, {'transaction_id': f'tx_{i}', 'amount': str(i * 10), 'date': '2023-01-01'}) 
                for i in range(100, 0, -1)]  # Reverse order
        
        results = pool.process_rows(rows, validate_and_transform_row)
        
        # Verify results are sorted by line number
        line_numbers = [r[0] for r in results]
        self.assertEqual(line_numbers, sorted(line_numbers),
            "Results should be sorted by line number")
        
        # Verify all results present
        self.assertEqual(len(results), 100)
        self.assertEqual(results[0][0], 1)  # First line number
        self.assertEqual(results[-1][0], 100)  # Last line number
    
    def test_concurrent_processing_speedup(self):
        """
        Test that parallel processing is faster than sequential.
        EXPECTED TO PASS: Parallel should be noticeably faster.
        """
        rows = [(i, {'transaction_id': f'tx_{i}', 'amount': '100', 'date': '2023-01-01'}) 
                for i in range(50)]
        
        def slow_process(line_num, row):
            time.sleep(0.01)  # Simulate work
            return validate_and_transform_row(line_num, row)
        
        # Sequential (1 worker)
        pool_seq = WorkerPool(max_workers=1)
        start = time.time()
        pool_seq.process_rows(rows, slow_process)
        seq_time = time.time() - start
        
        # Parallel (4 workers)
        pool_par = WorkerPool(max_workers=4)
        start = time.time()
        pool_par.process_rows(rows, slow_process)
        par_time = time.time() - start
        
        # Parallel should be at least 2x faster
        speedup = seq_time / par_time
        self.assertGreater(speedup, 1.5,
            f"Expected speedup > 1.5x, got {speedup:.2f}x")
    
    def test_error_handling(self):
        """
        Test that errors in worker threads are captured.
        EXPECTED TO PASS: Errors don't crash the pool.
        """
        pool = WorkerPool(max_workers=4)
        
        def error_prone_process(line_num, row):
            if line_num == 5:
                raise ValueError("Intentional error")
            return validate_and_transform_row(line_num, row)
        
        rows = [(i, {'transaction_id': f'tx_{i}', 'amount': '100', 'date': '2023-01-01'}) 
                for i in range(10)]
        
        results = pool.process_rows(rows, error_prone_process)
        
        # Should have results for all rows (including error)
        self.assertEqual(len(results), 10)
        
        # Row 5 should have error information
        error_result = next((r for r in results if r[0] == 5), None)
        self.assertIsNotNone(error_result)
        self.assertIn('error', error_result[1])


if __name__ == '__main__':
    unittest.main()
