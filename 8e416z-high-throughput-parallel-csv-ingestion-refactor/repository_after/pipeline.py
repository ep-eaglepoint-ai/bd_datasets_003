import threading
import signal
from streaming_reader import stream_csv_reader
from bloom_filter import ThreadSafeBloomFilter
from worker_pool import WorkerPool
from backpressure_queue import BackpressureQueue
from dlq import DeadLetterQueue
from db_writer import BatchDatabaseWriter

class IngestionPipeline:
    """
    Integrated pipeline that orchestrates all components for end-to-end CSV ingestion.
    
    Components:
    - Streaming Reader: Reads CSV incrementally
    - Bloom Filter: De-duplicates transaction IDs
    - Worker Pool: Parallel validation/transformation
    - Backpressure Queue: Bounded queue with backpressure
    - DLQ: Captures malformed rows
    - Batch DB Writer: Atomic batch commits
    """
    
    def __init__(self, csv_path, db_path, dlq_path='errors.csv', 
                 max_workers=4, queue_size=1000, batch_size=1000):
        """
        Initialize the pipeline.
        
        Args:
            csv_path: Path to input CSV file
            db_path: Path to output SQLite database
            dlq_path: Path to DLQ file (default: 'errors.csv')
            max_workers: Number of worker threads (default: 4)
            queue_size: Maximum queue size (default: 1000)
            batch_size: Database batch size (default: 1000)
        """
        self.csv_path = csv_path
        self.db_path = db_path
        
        # 100M capacity at 2% error rate takes ~100MB bit array.
        # Tuned to stay strictly under 256MB RSS including Python overhead.
        self.bloom_filter = ThreadSafeBloomFilter(capacity=100_000_000, error_rate=0.02)
        self.worker_pool = WorkerPool(max_workers=max_workers)
        # Reduced queue and batch size to minimize in-memory row overhead
        self.queue = BackpressureQueue(maxsize=min(queue_size, 200))
        self.dlq = DeadLetterQueue(dlq_file_path=dlq_path)
        self.db_writer = BatchDatabaseWriter(db_path=db_path, batch_size=min(batch_size, 500))
        
        self.producer_thread = None
        self.consumer_thread = None
        self.stop_flag = threading.Event()
        self.shutdown_requested = False
        
        # Register signal handlers for graceful shutdown
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)
    
    def _signal_handler(self, signum, frame):
        """
        Handle interrupt signals for graceful shutdown.
        
        Args:
            signum: Signal number
            frame: Current stack frame
        """
        print(f"\nReceived signal {signum}. Initiating graceful shutdown...")
        self.shutdown_requested = True
        self.stop()
    
    def _validate_and_transform(self, line_number, row):
        """
        Validate and transform a single row.
        
        Args:
            line_number: Line number from source file
            row: Dictionary representing CSV row
            
        Returns:
            (line_number, transformed_row) or None if invalid
        """
        try:
            # Validate required fields
            if not row.get('transaction_id'):
                raise ValueError("Missing transaction_id")
            
            # Check for duplicates using Bloom filter
            if self.bloom_filter.is_duplicate(row['transaction_id']):
                return None  # Skip duplicate
            
            # Transform data
            transformed = {
                'transaction_id': row['transaction_id'],
                'amount': float(row.get('amount', 0)),
                'date': row.get('date', '')
            }
            
            return (line_number, transformed)
            
        except Exception as e:
            # Record error to DLQ
            self.dlq.record_error(line_number, row, e)
            return None
    
    def _producer(self):
        """
        Producer thread: reads CSV and feeds queue.
        """
        try:
            for line_number, row in stream_csv_reader(self.csv_path):
                if self.stop_flag.is_set():
                    break
                self.queue.put((line_number, row))
        finally:
            # Signal end of input
            self.queue.put(None)
    
    def _consumer(self):
        """
        Consumer thread: processes queue and writes to DB.
        """
        batch = []
        
        while True:
            # Check if we should stop AND queue is empty
            if self.stop_flag.is_set() and self.queue.empty():
                break
                
            try:
                # Use a timeout so we can periodically check stop_flag
                item = self.queue.get(timeout=0.1)
            except:
                # Timeout reached, loop again to check stop_flag
                continue
            
            if item is None:
                # End of input signal
                break
            
            batch.append(item)
            
            # Process batch when it reaches a reasonable size
            if len(batch) >= 100:
                self._process_batch(batch)
                batch = []
        
        # Process remaining items
        if batch:
            self._process_batch(batch)
        
        # Flush DB writer
        self.db_writer.flush()
    
    def _process_batch(self, batch):
        """
        Process a batch of rows using worker pool.
        
        Args:
            batch: List of (line_number, row) tuples
        """
        # Process in parallel
        results = self.worker_pool.process_rows(batch, self._validate_and_transform)
        
        # Write valid results to database
        for line_number, transformed_row in results:
            if transformed_row and 'error' not in transformed_row:
                self.db_writer.write_record(transformed_row)
    
    def run(self):
        """
        Run the pipeline end-to-end.
        
        Returns:
            Dictionary with statistics: rows_written, errors, commits
        """
        # Start producer and consumer threads
        self.producer_thread = threading.Thread(target=self._producer)
        self.consumer_thread = threading.Thread(target=self._consumer)
        
        self.producer_thread.start()
        self.consumer_thread.start()
        
        # Wait for completion
        self.producer_thread.join()
        self.consumer_thread.join()
        
        # Return statistics
        return {
            'rows_written': self.db_writer.get_total_written(),
            'errors': self.dlq.get_error_count(),
            'commits': self.db_writer.get_commit_count(),
            'records_in_db': self.db_writer.count_records()
        }
    
    def stop(self):
        """Stop the pipeline gracefully."""
        self.stop_flag.set()
