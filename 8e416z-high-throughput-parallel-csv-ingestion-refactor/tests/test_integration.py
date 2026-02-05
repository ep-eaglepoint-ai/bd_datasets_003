import unittest
import sys
import os
import tempfile
import shutil
import csv

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../repository_after')))

from pipeline import IngestionPipeline

class TestIntegration(unittest.TestCase):
    """
    End-to-end integration tests for the complete pipeline.
    EXPECTED TO PASS against repository_after.
    """
    
    def setUp(self):
        self.test_dir = tempfile.mkdtemp()
        self.csv_path = os.path.join(self.test_dir, 'input.csv')
        self.db_path = os.path.join(self.test_dir, 'output.db')
        self.dlq_path = os.path.join(self.test_dir, 'errors.csv')
    
    def tearDown(self):
        shutil.rmtree(self.test_dir)
    
    def test_end_to_end_ingestion(self):
        """
        Test complete end-to-end ingestion pipeline.
        EXPECTED TO PASS: All components work together.
        """
        # Create test CSV with valid data
        with open(self.csv_path, 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['transaction_id', 'amount', 'date'])
            for i in range(100):
                writer.writerow([f'tx_{i}', 100.0 + i, '2023-01-01'])
        
        # Run pipeline
        pipeline = IngestionPipeline(
            csv_path=self.csv_path,
            db_path=self.db_path,
            dlq_path=self.dlq_path,
            max_workers=4,
            queue_size=50,
            batch_size=25
        )
        
        stats = pipeline.run()
        
        # Verify statistics
        self.assertEqual(stats['rows_written'], 100)
        self.assertEqual(stats['errors'], 0)
        self.assertEqual(stats['records_in_db'], 100)
        self.assertGreater(stats['commits'], 0)
    
    def test_row_counts_validation(self):
        """
        Test that row counts are accurate.
        EXPECTED TO PASS: Input rows = DB rows + DLQ rows.
        """
        # Create test CSV with mix of valid and invalid data
        with open(self.csv_path, 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['transaction_id', 'amount', 'date'])
            
            # 50 valid rows
            for i in range(50):
                writer.writerow([f'tx_{i}', 100.0, '2023-01-01'])
            
            # 10 invalid rows (missing transaction_id)
            for i in range(10):
                writer.writerow(['', 100.0, '2023-01-01'])
            
            # 10 invalid rows (bad amount)
            for i in range(10):
                writer.writerow([f'tx_bad_{i}', 'INVALID', '2023-01-01'])
        
        # Run pipeline
        pipeline = IngestionPipeline(
            csv_path=self.csv_path,
            db_path=self.db_path,
            dlq_path=self.dlq_path
        )
        
        stats = pipeline.run()
        
        # Verify counts
        self.assertEqual(stats['rows_written'], 50)  # Valid rows
        self.assertEqual(stats['errors'], 20)  # Invalid rows
        self.assertEqual(stats['records_in_db'], 50)
        
        # Total input = DB + DLQ
        total_input = 70
        total_processed = stats['records_in_db'] + stats['errors']
        self.assertEqual(total_processed, total_input)
    
    def test_dlq_counts_validation(self):
        """
        Test that DLQ accurately captures all errors.
        EXPECTED TO PASS: DLQ count matches error count.
        """
        # Create test CSV with errors
        with open(self.csv_path, 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['transaction_id', 'amount', 'date'])
            
            # 20 valid rows
            for i in range(20):
                writer.writerow([f'tx_{i}', 100.0, '2023-01-01'])
            
            # 15 invalid rows
            for i in range(15):
                writer.writerow(['', 100.0, '2023-01-01'])
        
        # Run pipeline
        pipeline = IngestionPipeline(
            csv_path=self.csv_path,
            db_path=self.db_path,
            dlq_path=self.dlq_path
        )
        
        stats = pipeline.run()
        
        # Verify DLQ
        self.assertEqual(stats['errors'], 15)
        
        # Read DLQ file
        dlq_errors = pipeline.dlq.read_errors()
        self.assertEqual(len(dlq_errors), 15)
        
        # Verify DLQ contains error details
        for error in dlq_errors:
            self.assertIn('line_number', error)
            self.assertIn('raw_data', error)
            self.assertIn('error_message', error)
            self.assertIn('Missing transaction_id', error['error_message'])
    
    def test_duplicate_handling(self):
        """
        Test that duplicates are filtered using Bloom filter.
        EXPECTED TO PASS: Duplicates are not written to DB.
        """
        # Create test CSV with duplicates
        with open(self.csv_path, 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['transaction_id', 'amount', 'date'])
            
            # Write same transaction_id multiple times
            for i in range(5):
                writer.writerow(['tx_duplicate', 100.0, '2023-01-01'])
            
            # Write unique transactions
            for i in range(10):
                writer.writerow([f'tx_{i}', 100.0, '2023-01-01'])
        
        # Run pipeline
        pipeline = IngestionPipeline(
            csv_path=self.csv_path,
            db_path=self.db_path,
            dlq_path=self.dlq_path
        )
        
        stats = pipeline.run()
        
        # Should only write 11 unique records (1 duplicate + 10 unique)
        self.assertEqual(stats['records_in_db'], 11)
    
    def test_large_file_ingestion(self):
        """
        Test pipeline with larger file.
        EXPECTED TO PASS: Can handle thousands of rows.
        """
        # Create large CSV
        with open(self.csv_path, 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['transaction_id', 'amount', 'date'])
            for i in range(5000):
                writer.writerow([f'tx_{i}', 100.0 + i, '2023-01-01'])
        
        # Run pipeline
        pipeline = IngestionPipeline(
            csv_path=self.csv_path,
            db_path=self.db_path,
            dlq_path=self.dlq_path,
            batch_size=1000
        )
        
        stats = pipeline.run()
        
        # Verify all rows processed
        self.assertEqual(stats['rows_written'], 5000)
        self.assertEqual(stats['records_in_db'], 5000)
        self.assertEqual(stats['errors'], 0)
        
        # Verify batching
        self.assertGreater(stats['commits'], 1)


if __name__ == '__main__':
    unittest.main()
