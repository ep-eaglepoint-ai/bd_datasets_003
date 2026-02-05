import unittest
import sys
import os
import tempfile
import shutil
import csv
import threading
import time
import signal
import sqlite3

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../repository_after')))

from pipeline import IngestionPipeline

class TestShutdown(unittest.TestCase):
    """
    Tests for graceful shutdown handling.
    EXPECTED TO PASS against repository_after.
    """
    
    def setUp(self):
        self.test_dir = tempfile.mkdtemp()
        self.csv_path = os.path.join(self.test_dir, 'input.csv')
        self.db_path = os.path.join(self.test_dir, 'output.db')
        self.dlq_path = os.path.join(self.test_dir, 'errors.csv')
        
        # Create a large CSV to allow time for interruption
        with open(self.csv_path, 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['transaction_id', 'amount', 'date'])
            for i in range(100000):
                writer.writerow([f'tx_{i}', 100.0, '2023-01-01'])
    
    def tearDown(self):
        shutil.rmtree(self.test_dir)
    
    def test_graceful_shutdown_via_signal(self):
        """
        Test that pipeline shuts down gracefully when receiving SIGINT.
        EXPECTED TO PASS: In-flight work completes, resources close.
        """
        pipeline = IngestionPipeline(
            csv_path=self.csv_path,
            db_path=self.db_path,
            dlq_path=self.dlq_path,
            max_workers=2,
            queue_size=100,
            batch_size=50
        )
        
        # Start pipeline in a separate thread so we can interrupt it
        stats_box = {}
        def run_pipeline():
            stats_box['stats'] = pipeline.run()
            
        t = threading.Thread(target=run_pipeline)
        t.start()
        
        # Wait a bit for it to start processing
        time.sleep(0.5)
        
        # Simulate SIGINT
        os.kill(os.getpid(), signal.SIGINT)
        
        # Wait for pipeline to finish
        t.join(timeout=10)
        
        self.assertFalse(t.is_alive(), "Pipeline should have stopped")
        
        # Verify that some work was done but it stopped before finishing all 5000
        stats = stats_box.get('stats', {})
        rows_in_db = stats.get('records_in_db', 0)
        
        # It should have processed some but not all
        self.assertGreater(rows_in_db, 0, "Should have processed some rows")
        self.assertLess(rows_in_db, 100000, "Should have stopped early")
        
        # Verify DB is readable and not corrupted
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM transactions")
        db_count = cursor.fetchone()[0]
        conn.close()
        
        self.assertEqual(db_count, rows_in_db, "DB count should match statistics")
    
    def test_drain_on_shutdown(self):
        """
        Test that the consumer drains the queue even after stop is called.
        EXPECTED TO PASS: Items in queue are processed before exit.
        """
        pipeline = IngestionPipeline(
            csv_path=self.csv_path,
            db_path=self.db_path,
            dlq_path=self.dlq_path,
            max_workers=2,
            queue_size=100
        )
        
        # Fill the queue manually
        for i in range(10):
            pipeline.queue.put((i, {'transaction_id': f'tx_q_{i}', 'amount': 10, 'date': '2023-01-01'}))
            
        # Signal stop
        pipeline.stop()
        
        # Run consumer once (it should drain the 10 items)
        # We need to monkey-patch producer to not do anything
        pipeline._producer = lambda: pipeline.queue.put(None)
        
        stats = pipeline.run()
        
        # It should have processed the 10 items we put in the queue
        self.assertGreaterEqual(stats['records_in_db'], 10, 
                                f"Queue should have been drained. Got {stats['records_in_db']}")

if __name__ == '__main__':
    unittest.main()
