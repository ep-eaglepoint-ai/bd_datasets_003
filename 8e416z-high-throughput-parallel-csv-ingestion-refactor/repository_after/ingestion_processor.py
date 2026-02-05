from pipeline import IngestionPipeline
import os

def process_large_file(file_path, db_path):
    """
    Refactored entry point for high-throughput, parallel streaming CSV ingestion.
    Matches the signature of the legacy processor.
    """
    # Initialize and run the pipeline
    # Using sensible defaults that meet all requirements
    pipeline = IngestionPipeline(
        csv_path=file_path,
        db_path=db_path,
        dlq_path='errors.csv',
        max_workers=4,
        queue_size=1000,
        batch_size=1000
    )
    
    return pipeline.run()
