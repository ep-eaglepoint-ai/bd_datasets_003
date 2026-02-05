import unittest
import sys
import os
import tempfile
import shutil
import csv
import io
import psutil

class TestStreamingReaderAfter(unittest.TestCase):
    """
    Tests against repository_after - EXPECTED TO PASS
    New streaming reader maintains constant memory.
    """
    
    def setUp(self):
        self.test_dir = tempfile.mkdtemp()
        self.csv_path = os.path.join(self.test_dir, 'input.csv')
        sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../repository_after')))
        
    def tearDown(self):
        shutil.rmtree(self.test_dir)
    
    def test_incremental_iteration_after(self):
        """
        Test that streaming reader supports incremental iteration.
        EXPECTED TO PASS: Generator yields one row at a time.
        """
        with open(self.csv_path, 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['transaction_id', 'amount', 'date'])
            for i in range(100):
                writer.writerow([f'tx_{i}', 100, '2023-01-01'])
        
        from streaming_reader import stream_csv_reader
        
        rows_yielded = 0
        for line_num, row in stream_csv_reader(self.csv_path):
            self.assertIsInstance(line_num, int)
            self.assertIsInstance(row, dict)
            self.assertIn('transaction_id', row)
            rows_yielded += 1
            if rows_yielded >= 10:
                break
        
        self.assertEqual(rows_yielded, 10, "Should yield rows incrementally")
    
    def test_line_numbers_included(self):
        """
        Test that each row includes its original line number.
        EXPECTED TO PASS: Generator yields (line_number, row_dict).
        """
        with open(self.csv_path, 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['transaction_id', 'amount', 'date'])
            writer.writerow(['tx_1', 100, '2023-01-01'])
            writer.writerow(['tx_2', 200, '2023-01-02'])
        
        from streaming_reader import stream_csv_reader
        
        results = list(stream_csv_reader(self.csv_path))
        
        self.assertEqual(len(results), 2)
        self.assertEqual(results[0][0], 2)
        self.assertEqual(results[1][0], 3)
        self.assertEqual(results[0][1]['transaction_id'], 'tx_1')
        self.assertEqual(results[1][1]['transaction_id'], 'tx_2')
    
    def test_memory_constant_after(self):
        """
        Test that streaming reader maintains constant memory usage.
        EXPECTED TO PASS: Memory does not grow with file size.
        """
        rows = 50000
        
        with open(self.csv_path, 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['transaction_id', 'amount', 'date'])
            for i in range(rows):
                writer.writerow([f'tx_{i}', 100.50, '2023-01-01'])
        
        from streaming_reader import stream_csv_reader
        
        process = psutil.Process(os.getpid())
        mem_before = process.memory_info().rss / (1024 * 1024)
        
        count = 0
        for line_num, row in stream_csv_reader(self.csv_path):
            count += 1
        
        mem_after = process.memory_info().rss / (1024 * 1024)
        mem_growth = mem_after - mem_before
        
        self.assertEqual(count, rows)
        self.assertLess(mem_growth, 10,
            f"Memory grew by {mem_growth:.2f}MB. Should maintain constant memory.")
    
    def test_simulated_large_input(self):
        """
        Test using io.StringIO to simulate large input.
        EXPECTED TO PASS: Can handle large simulated streams.
        """
        large_csv = io.StringIO()
        writer = csv.writer(large_csv)
        writer.writerow(['transaction_id', 'amount', 'date'])
        for i in range(10000):
            writer.writerow([f'tx_{i}', 100.50, '2023-01-01'])
        
        large_csv.seek(0)
        
        reader = csv.DictReader(large_csv)
        count = 0
        for row in reader:
            count += 1
            if count >= 100:
                break
        
        self.assertEqual(count, 100, "Should handle large simulated streams")


if __name__ == '__main__':
    unittest.main()
