import sqlite3
import threading

class BatchDatabaseWriter:
    """
    Batched database writer with atomic commits.
    
    Writes records in fixed-size batches to reduce I/O overhead
    and database lock contention.
    """
    
    def __init__(self, db_path, batch_size=1000):
        """
        Initialize the batch writer.
        
        Args:
            db_path: Path to SQLite database
            batch_size: Number of records per batch (default: 1000)
        """
        self.db_path = db_path
        self.batch_size = batch_size
        self.batch = []
        self.lock = threading.Lock()
        self.total_written = 0
        self.commit_count = 0
        self._initialize_db()
    
    def _initialize_db(self):
        """Initialize the database with required schema."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS transactions (
                transaction_id TEXT PRIMARY KEY,
                amount REAL,
                date TEXT
            )
        ''')
        conn.commit()
        conn.close()
    
    def write_record(self, record):
        """
        Add a record to the batch.
        
        If batch is full, commits automatically.
        
        Args:
            record: Dictionary with keys: transaction_id, amount, date
        """
        with self.lock:
            self.batch.append(record)
            if len(self.batch) >= self.batch_size:
                self._commit_batch()
    
    def _commit_batch(self):
        """
        Commit the current batch atomically.
        
        This is called automatically when batch is full,
        or manually via flush().
        """
        if not self.batch:
            return
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        try:
            # Begin transaction
            cursor.execute('BEGIN TRANSACTION')
            
            # Insert all records in batch
            for record in self.batch:
                cursor.execute(
                    'INSERT OR REPLACE INTO transactions (transaction_id, amount, date) VALUES (?, ?, ?)',
                    (record['transaction_id'], record['amount'], record['date'])
                )
            
            # Commit atomically
            conn.commit()
            self.commit_count += 1
            self.total_written += len(self.batch)
            self.batch = []
            
        except Exception as e:
            # Rollback on error
            conn.rollback()
            raise e
        finally:
            conn.close()
    
    def flush(self):
        """
        Flush any remaining records in the batch.
        
        Should be called at the end of processing.
        """
        with self.lock:
            if self.batch:
                self._commit_batch()
    
    def get_commit_count(self):
        """
        Get the number of commits performed.
        
        Returns:
            Total number of batch commits
        """
        with self.lock:
            return self.commit_count
    
    def get_total_written(self):
        """
        Get the total number of records written.
        
        Returns:
            Total records written to database
        """
        with self.lock:
            return self.total_written
    
    def count_records(self):
        """
        Count total records in the database.
        
        Returns:
            Number of records in transactions table
        """
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('SELECT COUNT(*) FROM transactions')
        count = cursor.fetchone()[0]
        conn.close()
        return count
