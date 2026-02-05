import unittest
import sys
import os
import tempfile
import shutil
import sqlite3

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../repository_after')))

from db_writer import BatchDatabaseWriter

class TestDBWriter(unittest.TestCase):
    """
    Tests for batched database writer.
    EXPECTED TO PASS against repository_after.
    """
    
    def setUp(self):
        self.test_dir = tempfile.mkdtemp()
        self.db_path = os.path.join(self.test_dir, 'test.db')
    
    def tearDown(self):
        shutil.rmtree(self.test_dir)
    
    def test_fixed_size_batches(self):
        """
        Test that records are written in fixed-size batches.
        EXPECTED TO PASS: Commits occur at batch boundaries.
        """
        writer = BatchDatabaseWriter(db_path=self.db_path, batch_size=10)
        
        # Write 25 records
        for i in range(25):
            writer.write_record({
                'transaction_id': f'tx_{i}',
                'amount': 100.0 + i,
                'date': '2023-01-01'
            })
        
        # Should have committed 2 batches (10 + 10)
        # 5 records still in buffer
        self.assertEqual(writer.get_commit_count(), 2)
        self.assertEqual(writer.get_total_written(), 20)
        
        # Flush remaining
        writer.flush()
        
        # Should have committed 3rd batch
        self.assertEqual(writer.get_commit_count(), 3)
        self.assertEqual(writer.get_total_written(), 25)
        
        # Verify all records in DB
        self.assertEqual(writer.count_records(), 25)
    
    def test_atomic_commits(self):
        """
        Test that batches are committed atomically.
        EXPECTED TO PASS: Either all records in batch are committed or none.
        """
        writer = BatchDatabaseWriter(db_path=self.db_path, batch_size=5)
        
        # Write 4 records (not enough to trigger commit)
        for i in range(4):
            writer.write_record({
                'transaction_id': f'tx_{i}',
                'amount': 100.0,
                'date': '2023-01-01'
            })
        
        # No commits yet
        self.assertEqual(writer.get_commit_count(), 0)
        self.assertEqual(writer.count_records(), 0)
        
        # Write 5th record (triggers commit)
        writer.write_record({
            'transaction_id': 'tx_4',
            'amount': 100.0,
            'date': '2023-01-01'
        })
        
        # All 5 should be committed atomically
        self.assertEqual(writer.get_commit_count(), 1)
        self.assertEqual(writer.count_records(), 5)
    
    def test_commit_frequency(self):
        """
        Test that commits occur at expected frequency.
        EXPECTED TO PASS: Commits = ceil(records / batch_size).
        """
        batch_size = 100
        writer = BatchDatabaseWriter(db_path=self.db_path, batch_size=batch_size)
        
        # Write 350 records
        for i in range(350):
            writer.write_record({
                'transaction_id': f'tx_{i}',
                'amount': 100.0,
                'date': '2023-01-01'
            })
        
        # Should have 3 commits (100 + 100 + 100)
        self.assertEqual(writer.get_commit_count(), 3)
        
        # Flush remaining 50
        writer.flush()
        
        # Should have 4 commits total
        self.assertEqual(writer.get_commit_count(), 4)
        
        # Verify all records
        self.assertEqual(writer.count_records(), 350)
    
    def test_flush_empty_batch(self):
        """
        Test that flushing empty batch doesn't cause errors.
        EXPECTED TO PASS: No-op when batch is empty.
        """
        writer = BatchDatabaseWriter(db_path=self.db_path, batch_size=10)
        
        # Flush without writing anything
        writer.flush()
        
        self.assertEqual(writer.get_commit_count(), 0)
        self.assertEqual(writer.count_records(), 0)
    
    def test_duplicate_handling(self):
        """
        Test that duplicates are handled correctly (INSERT OR REPLACE).
        EXPECTED TO PASS: Later records replace earlier ones.
        """
        writer = BatchDatabaseWriter(db_path=self.db_path, batch_size=5)
        
        # Write same transaction_id twice
        writer.write_record({
            'transaction_id': 'tx_1',
            'amount': 100.0,
            'date': '2023-01-01'
        })
        
        writer.write_record({
            'transaction_id': 'tx_1',
            'amount': 200.0,  # Different amount
            'date': '2023-01-02'
        })
        
        writer.flush()
        
        # Should only have 1 record
        self.assertEqual(writer.count_records(), 1)
        
        # Verify it has the latest values
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('SELECT amount, date FROM transactions WHERE transaction_id = ?', ('tx_1',))
        row = cursor.fetchone()
        conn.close()
        
        self.assertEqual(row[0], 200.0)
        self.assertEqual(row[1], '2023-01-02')
    
    def test_large_batch(self):
        """
        Test with large number of records.
        EXPECTED TO PASS: Can handle thousands of records efficiently.
        """
        writer = BatchDatabaseWriter(db_path=self.db_path, batch_size=1000)
        
        # Write 5000 records
        for i in range(5000):
            writer.write_record({
                'transaction_id': f'tx_{i}',
                'amount': 100.0 + i,
                'date': '2023-01-01'
            })
        
        writer.flush()
        
        # Should have 5 commits (1000 * 5)
        self.assertEqual(writer.get_commit_count(), 5)
        self.assertEqual(writer.count_records(), 5000)
    
    def test_rollback_on_error(self):
        """
        Test that errors cause rollback (batch atomicity).
        EXPECTED TO PASS: Invalid data doesn't partially commit.
        """
        writer = BatchDatabaseWriter(db_path=self.db_path, batch_size=5)
        
        # Write 3 valid records
        for i in range(3):
            writer.write_record({
                'transaction_id': f'tx_{i}',
                'amount': 100.0,
                'date': '2023-01-01'
            })
        
        # The batch hasn't committed yet
        self.assertEqual(writer.count_records(), 0)
        
        # Write 2 more to trigger commit
        writer.write_record({
            'transaction_id': 'tx_3',
            'amount': 100.0,
            'date': '2023-01-01'
        })
        writer.write_record({
            'transaction_id': 'tx_4',
            'amount': 100.0,
            'date': '2023-01-01'
        })
        
        # All 5 should be committed
        self.assertEqual(writer.count_records(), 5)


if __name__ == '__main__':
    unittest.main()
