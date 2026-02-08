import csv
import threading
import os

class DeadLetterQueue:
    """
    Thread-safe Dead Letter Queue for persisting malformed rows.
    
    Records raw row data, line numbers, and exception messages,
    allowing the pipeline to continue processing valid rows.
    """
    
    def __init__(self, dlq_file_path='errors.csv'):
        """
        Initialize the DLQ.
        
        Args:
            dlq_file_path: Path to the DLQ file (default: 'errors.csv')
        """
        self.dlq_file_path = dlq_file_path
        self.lock = threading.Lock()
        self.error_count = 0
        self._initialize_file()
    
    def _initialize_file(self):
        """Initialize the DLQ file with headers if it doesn't exist."""
        with self.lock:
            file_exists = os.path.isfile(self.dlq_file_path)
            if not file_exists:
                with open(self.dlq_file_path, 'w', newline='') as f:
                    writer = csv.writer(f)
                    writer.writerow(['line_number', 'raw_data', 'error_message'])
    
    def record_error(self, line_number, raw_row, exception):
        """
        Record a malformed row to the DLQ.
        
        Args:
            line_number: Original line number from source file
            raw_row: Raw row data (dict or string)
            exception: Exception that was raised
        """
        with self.lock:
            with open(self.dlq_file_path, 'a', newline='') as f:
                writer = csv.writer(f)
                writer.writerow([
                    line_number,
                    str(raw_row),
                    str(exception)
                ])
            self.error_count += 1
    
    def get_error_count(self):
        """
        Get the total number of errors recorded.
        
        Returns:
            Total error count
        """
        with self.lock:
            return self.error_count
    
    def read_errors(self):
        """
        Read all errors from the DLQ file.
        
        Returns:
            List of error dictionaries with keys: line_number, raw_data, error_message
        """
        errors = []
        with self.lock:
            if os.path.isfile(self.dlq_file_path):
                with open(self.dlq_file_path, 'r', newline='') as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        errors.append(row)
        return errors
    
    def clear(self):
        """Clear the DLQ file and reset error count."""
        with self.lock:
            if os.path.isfile(self.dlq_file_path):
                os.remove(self.dlq_file_path)
            self.error_count = 0
            # Initialize file without re-acquiring lock
            with open(self.dlq_file_path, 'w', newline='') as f:
                writer = csv.writer(f)
                writer.writerow(['line_number', 'raw_data', 'error_message'])
