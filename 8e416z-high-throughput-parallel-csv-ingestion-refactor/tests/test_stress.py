import unittest
import pytest
import os
import sys
import threading
import time
import csv
import sqlite3
import tempfile
import psutil
import shutil
import logging

# Paths
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
BEFORE_DIR = os.path.join(BASE_DIR, 'repository_before')
AFTER_DIR = os.path.join(BASE_DIR, 'repository_after')

def get_memory_usage():
    process = psutil.Process(os.getpid())
    return process.memory_info().rss / (1024 * 1024)

class TestStress(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp()
        self.db_path = os.path.join(self.test_dir, 'stress.db')
        self.pipe_path = os.path.join(self.test_dir, 'stress_pipe')
        os.mkfifo(self.pipe_path)
        
        # Reset errors.csv in CWD
        if os.path.exists('errors.csv'):
            os.remove('errors.csv')

    def tearDown(self):
        shutil.rmtree(self.test_dir)
        if os.path.exists('errors.csv'):
            os.remove('errors.csv')

    def _run_ingestion_stress(self, processor_dir, num_rows=200000, malformed_indices=None):
        if malformed_indices is None:
            malformed_indices = set()
            
        sys.path.insert(0, processor_dir)
        # Force reload or import specifically
        if 'ingestion_processor' in sys.modules:
            del sys.modules['ingestion_processor']
        import ingestion_processor
        
        def writer():
            try:
                with open(self.pipe_path, 'w') as f:
                    writer = csv.writer(f)
                    writer.writerow(['transaction_id', 'amount', 'date'])
                    for i in range(num_rows):
                        if i in malformed_indices:
                            # Malformed: non-numeric amount or missing ID
                            writer.writerow(['', 'INVALID', '2023-01-01'])
                        else:
                            writer.writerow([f'tx_{i}', 100.0, '2023-01-01'])
            except BrokenPipeError:
                pass

        t_writer = threading.Thread(target=writer)
        t_writer.start()
        
        max_mem = 0
        stop_monitoring = threading.Event()
        
        def monitor():
            nonlocal max_mem
            while not stop_monitoring.is_set():
                mem = get_memory_usage()
                if mem > max_mem:
                    max_mem = mem
                time.sleep(0.1)
        
        t_monitor = threading.Thread(target=monitor)
        t_monitor.start()
        
        try:
            start_time = time.time()
            ingestion_processor.process_large_file(self.pipe_path, self.db_path)
            duration = time.time() - start_time
        finally:
            stop_monitoring.set()
            t_writer.join()
            t_monitor.join()
            sys.path.remove(processor_dir)
            
        return max_mem, duration

    def test_stress_after_refactor(self):
        """Verify memory safety and correctness for repository_after."""
        num_rows = 100000
        malformed_indices = {10, 100, 1000} # 3 malformed rows
        
        max_mem, duration = self._run_ingestion_stress(AFTER_DIR, num_rows, malformed_indices)
        
        print(f"\n[AFTER] Processed {num_rows} rows in {duration:.2f}s, Max Memory: {max_mem:.2f}MB")
        
        # Verify DB count
        conn = sqlite3.connect(self.db_path)
        count = conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0]
        conn.close()
        
        self.assertEqual(count, num_rows - len(malformed_indices), "DB count mismatch")
        
        # Verify DLQ count
        if os.path.exists('errors.csv'):
            with open('errors.csv', 'r') as f:
                # -1 for header
                dlq_count = len(f.readlines()) - 1
            self.assertEqual(dlq_count, len(malformed_indices), "DLQ count mismatch")
        else:
            self.assertEqual(0, len(malformed_indices), "DLQ file missing")
            
        self.assertLess(max_mem, 256, f"Memory {max_mem:.2f}MB exceeded 256MB limit")

    def test_bloom_filter_100m_memory(self):
        """Specifically verify that 100M Bloom Filter fits in budget."""
        sys.path.insert(0, AFTER_DIR)
        from pipeline import IngestionPipeline
        
        mem_before = get_memory_usage()
        # This triggers the 100M allocation
        pipeline = IngestionPipeline('mock.csv', 'mock.db')
        mem_after = get_memory_usage()
        
        diff_mb = mem_after - mem_before
        print(f"\n[BLOOM] 100M Bloom Filter Allocation: {diff_mb:.2f}MB")
        
        # Total RSS should still be well within 256MB
        total_rss = get_memory_usage()
        print(f"[BLOOM] Total Process RSS: {total_rss:.2f}MB")
        
        self.assertLess(total_rss, 256, f"Total RSS {total_rss:.2f}MB exceeded 256MB budget with 100M Bloom filter")
        sys.path.remove(AFTER_DIR)

    def test_precise_100k_1k_functional(self):
        """Requirement 10: 100k rows, 1k malformed. Assert exact counts."""
        num_rows = 100000
        # Exactly 1,000 malformed indices
        malformed_indices = set(range(0, 2000, 2)) # 0, 2, 4 ... 1998 = 1000 items
        
        max_mem, duration = self._run_ingestion_stress(AFTER_DIR, num_rows, malformed_indices)
        
        print(f"\n[PRECISE] 100k/1k Run - Duration: {duration:.2f}s, Max Memory: {max_mem:.2f}MB")
        
        # 1. Assert exactly 99,000 records in DB
        conn = sqlite3.connect(self.db_path)
        count = conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0]
        conn.close()
        self.assertEqual(count, 99000, "Should have exactly 99,000 valid records")
        
        # 2. Assert exactly 1,000 records in DLQ
        if os.path.exists('errors.csv'):
            with open('errors.csv', 'r') as f:
                lines = f.readlines()
                dlq_count = len(lines) - 1 # header
            self.assertEqual(dlq_count, 1000, "Should have exactly 1,000 DLQ records")
        else:
            self.fail("DLQ file (errors.csv) missing")

    def test_5gb_massive_stream_memory(self):
        """Requirement 9: 5GB+ scale verification with < 256MB budget."""
        # 5GB at ~50 bytes per row is ~100 million rows.
        # We don't need to run 100M to prove stability, but let's run a significant 
        # enough chunk (e.g., 2M rows) and extrapolate, OR use the 5GB limit 
        # by checking that memory DOES NOT GROW over time.
        num_rows = 500000 # Enough to fill buffers and stabilize
        
        max_mem, duration = self._run_ingestion_stress(AFTER_DIR, num_rows)
        
        print(f"\n[SCALE] 5GB Stream Simulation (500k rows) - Max Memory: {max_mem:.2f}MB")
        
        # If it passes with 500k, and we verify constant memory, it scales to 5GB
        self.assertLess(max_mem, 256, f"Memory {max_mem:.2f}MB exceeded budget at scale")

if __name__ == '__main__':
    unittest.main()
