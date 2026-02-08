# filename: ingestion_processor.py
# Legacy ingestion logic using Pandas. 
# Imports: pandas (data analysis), sqlite3 (database storage)

import pandas as pd
import sqlite3
import logging

def process_large_file(file_path, db_path):
    """
    EXTREMELY MEMORY INTENSIVE: Loads the entire CSV into memory.
    Lacks parallel processing and granular error handling.
    """
    logging.info("Starting legacy ingestion...")
    try:
        # BUG: This will OOM on any file larger than available RAM
        df = pd.read_csv(file_path)
        
        # Manual de-duplication is slow and memory intensive
        df.drop_duplicates(subset=['transaction_id'], keep='first', inplace=True)
        
        conn = sqlite3.connect(db_path)
        # BUG: Single-threaded insert is slow and lacks backpressure control
        df.to_sql('transactions', conn, if_exists='append', index=False)
        conn.close()
        logging.info("Ingestion complete.")
    except Exception as e:
        # BUG: Swallows specific error contexts; fails entire file on one bad row
        logging.error(f"Ingestion failed: {e}")
