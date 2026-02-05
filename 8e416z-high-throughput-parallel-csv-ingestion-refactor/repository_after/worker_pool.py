from concurrent.futures import ThreadPoolExecutor, as_completed
import threading

class WorkerPool:
    """
    Parallel worker pool for processing CSV rows concurrently.
    
    Uses ThreadPoolExecutor to parallelize validation and transformation
    across multiple worker threads.
    """
    
    def __init__(self, max_workers=4):
        """
        Initialize the worker pool.
        
        Args:
            max_workers: Maximum number of worker threads (default: 4)
        """
        self.max_workers = max_workers
        self.executor = None
    
    def process_rows(self, rows, process_func):
        """
        Process rows in parallel using worker threads.
        
        Args:
            rows: Iterable of (line_number, row_dict) tuples
            process_func: Function to apply to each row, signature: func(line_number, row_dict)
                         Should return (line_number, result) or (line_number, None) for errors
        
        Returns:
            List of (line_number, result) tuples in deterministic order
        """
        results = []
        
        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            # Submit all tasks
            future_to_row = {
                executor.submit(process_func, line_num, row): line_num 
                for line_num, row in rows
            }
            
            # Collect results as they complete
            for future in as_completed(future_to_row):
                line_num = future_to_row[future]
                try:
                    result = future.result()
                    if result is not None:
                        results.append(result)
                except Exception as e:
                    # Store error information
                    results.append((line_num, {'error': str(e)}))
        
        # Sort by line number to maintain deterministic order
        results.sort(key=lambda x: x[0])
        return results
    
    def get_active_worker_count(self):
        """
        Get the number of active worker threads.
        
        Returns:
            Number of active threads
        """
        return threading.active_count()


def validate_and_transform_row(line_number, row):
    """
    Example validation and transformation function.
    
    Args:
        line_number: Line number from source file
        row: Dictionary representing the CSV row
        
    Returns:
        (line_number, transformed_row) or None if validation fails
    """
    # Basic validation
    if not row.get('transaction_id'):
        return None
    
    # Simple transformation (example: convert amount to float)
    try:
        transformed = {
            'transaction_id': row['transaction_id'],
            'amount': float(row.get('amount', 0)),
            'date': row.get('date', '')
        }
        return (line_number, transformed)
    except (ValueError, TypeError):
        return None
