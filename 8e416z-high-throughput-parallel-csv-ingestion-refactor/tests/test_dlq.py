import unittest
import sys
import os
import tempfile
import shutil
import threading

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../repository_after')))

from dlq import DeadLetterQueue

class TestDLQ(unittest.TestCase):
    """
    Tests for Dead Letter Queue.
    EXPECTED TO PASS against repository_after.
    """
    
    def setUp(self):
        self.test_dir = tempfile.mkdtemp()
        self.dlq_path = os.path.join(self.test_dir, 'test_errors.csv')
    
    def tearDown(self):
        shutil.rmtree(self.test_dir)
    
    def test_malformed_rows_dont_stop_pipeline(self):
        """
        Test that malformed rows are captured without stopping processing.
        EXPECTED TO PASS: Pipeline continues after errors.
        """
        dlq = DeadLetterQueue(dlq_file_path=self.dlq_path)
        
        # Simulate processing with some errors
        rows_processed = 0
        errors_encountered = 0
        
        for i in range(10):
            try:
                if i in [2, 5, 7]:  # Simulate errors on these rows
                    raise ValueError(f"Invalid data at row {i}")
                rows_processed += 1
            except Exception as e:
                dlq.record_error(i, {'data': f'row_{i}'}, e)
                errors_encountered += 1
        
        # Should have processed 7 valid rows
        self.assertEqual(rows_processed, 7)
        
        # Should have recorded 3 errors
        self.assertEqual(errors_encountered, 3)
        self.assertEqual(dlq.get_error_count(), 3)
    
    def test_exact_dlq_contents_and_counts(self):
        """
        Test that DLQ records exact error information.
        EXPECTED TO PASS: All error details are captured correctly.
        """
        dlq = DeadLetterQueue(dlq_file_path=self.dlq_path)
        
        # Record specific errors
        dlq.record_error(10, {'transaction_id': '', 'amount': '100'}, 
                        ValueError("Missing transaction_id"))
        dlq.record_error(25, {'transaction_id': 'tx_25', 'amount': 'INVALID'}, 
                        ValueError("Invalid amount"))
        dlq.record_error(42, {'transaction_id': 'tx_42', 'amount': '500', 'extra': 'field'}, 
                        KeyError("Unexpected field"))
        
        # Verify count
        self.assertEqual(dlq.get_error_count(), 3)
        
        # Read and verify contents
        errors = dlq.read_errors()
        self.assertEqual(len(errors), 3)
        
        # Verify first error
        self.assertEqual(errors[0]['line_number'], '10')
        self.assertIn('transaction_id', errors[0]['raw_data'])
        self.assertIn('Missing transaction_id', errors[0]['error_message'])
        
        # Verify second error
        self.assertEqual(errors[1]['line_number'], '25')
        self.assertIn('INVALID', errors[1]['raw_data'])
        self.assertIn('Invalid amount', errors[1]['error_message'])
        
        # Verify third error
        self.assertEqual(errors[2]['line_number'], '42')
        self.assertIn('extra', errors[2]['raw_data'])
        self.assertIn('Unexpected field', errors[2]['error_message'])
    
    def test_thread_safety(self):
        """
        Test that DLQ is thread-safe.
        EXPECTED TO PASS: Concurrent writes don't corrupt data.
        """
        dlq = DeadLetterQueue(dlq_file_path=self.dlq_path)
        
        def worker(thread_id):
            for i in range(10):
                dlq.record_error(
                    thread_id * 100 + i,
                    {'thread': thread_id, 'item': i},
                    ValueError(f"Error from thread {thread_id}")
                )
        
        # Create 5 threads
        threads = []
        for i in range(5):
            t = threading.Thread(target=worker, args=(i,))
            threads.append(t)
            t.start()
        
        for t in threads:
            t.join()
        
        # Should have 50 total errors (5 threads * 10 errors each)
        self.assertEqual(dlq.get_error_count(), 50)
        
        # Read and verify
        errors = dlq.read_errors()
        self.assertEqual(len(errors), 50)
    
    def test_dlq_file_format(self):
        """
        Test that DLQ file has correct format.
        EXPECTED TO PASS: File has headers and proper CSV structure.
        """
        dlq = DeadLetterQueue(dlq_file_path=self.dlq_path)
        
        # Record an error
        dlq.record_error(100, {'test': 'data'}, Exception("Test error"))
        
        # Read file directly
        with open(self.dlq_path, 'r') as f:
            lines = f.readlines()
        
        # Should have header + 1 data row
        self.assertEqual(len(lines), 2)
        
        # Verify header
        self.assertIn('line_number', lines[0])
        self.assertIn('raw_data', lines[0])
        self.assertIn('error_message', lines[0])
    
    def test_clear_dlq(self):
        """
        Test that DLQ can be cleared.
        EXPECTED TO PASS: Clear resets count and file.
        """
        dlq = DeadLetterQueue(dlq_file_path=self.dlq_path)
        
        # Add some errors
        for i in range(5):
            dlq.record_error(i, {'data': i}, ValueError(f"Error {i}"))
        
        self.assertEqual(dlq.get_error_count(), 5)
        
        # Clear
        dlq.clear()
        
        # Should be reset
        self.assertEqual(dlq.get_error_count(), 0)
        errors = dlq.read_errors()
        self.assertEqual(len(errors), 0)
    
    def test_large_volume_errors(self):
        """
        Test DLQ with large volume of errors.
        EXPECTED TO PASS: Can handle many errors efficiently.
        """
        dlq = DeadLetterQueue(dlq_file_path=self.dlq_path)
        
        # Record 1000 errors
        for i in range(1000):
            dlq.record_error(i, {'data': f'row_{i}'}, ValueError(f"Error {i}"))
        
        # Verify count
        self.assertEqual(dlq.get_error_count(), 1000)
        
        # Verify all recorded
        errors = dlq.read_errors()
        self.assertEqual(len(errors), 1000)


if __name__ == '__main__':
    unittest.main()
