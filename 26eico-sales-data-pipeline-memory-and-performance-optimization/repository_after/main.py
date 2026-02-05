#!/usr/bin/env python3
import warnings
# SimpleFilter to ignore potential settingWithCopy or others in production run if noisy
warnings.simplefilter(action='ignore', category=FutureWarning)

import gc
import os
import sys
import pandas as pd
from tqdm import tqdm

from ingest import load_sales_data, CHUNK_SIZE, get_csv_info
from transform import transform_data
from aggregate import AggregationState, update_aggregates, finalize_aggregates
from export import export_to_database
from logger import log_malformed_row

from checksum import compute_aggregate_checksums, verify_checksums

DEFAULT_FILEPATH = os.environ.get("SALES_DATA_CSV", "sales_data.csv")

def main():
    print("Starting optimized sales data pipeline...")
    
    # Initialize Aggregation State
    agg_state = AggregationState()
    
    FILEPATH = DEFAULT_FILEPATH
    
    if not os.path.exists(FILEPATH):
        print(f"File {FILEPATH} not found. Ensure it exists or mount it.")
        # Fallback for testing/CI if needed, but per requirements we expect it.
        # Check if we are in a test env where we might want to skip or handle gracefully?
        # For now, let it fail naturally if missing in read_csv context, or printing here.
        
    print(f"Processing {FILEPATH} in chunks...")

    csv_info = None
    if os.path.exists(FILEPATH):
        csv_info = get_csv_info(FILEPATH)
        total_rows = csv_info.total_rows
    else:
        # In tests we often patch load_sales_data anyway.
        total_rows = 0
    
    try:
        # Req 7: progress bar must have a real total so % + ETA are meaningful.
        with tqdm(total=total_rows, unit='rows', desc='Processing') as pbar:
            chunk_iter = load_sales_data(FILEPATH)
            
            for i, chunk in enumerate(chunk_iter):
                # 1. Transform
                # Handle malformed rows? Ingest already read them.
                # If read_csv failed on bad lines, we might need on_bad_lines='skip' in ingest.
                # Requirement: Log malformed rows. read_csv has on_bad_lines param since 1.3
                # We should update ingest.py to use on_bad_lines with a callable if we want to log exact lines,
                # or simplified: just count dropped.
                # Prompt says: "Log malformed... including original line number".
                # Standard pandas engine='c' (fast) doesn't easily give line numbers to callback.
                # python engine does but is slow.
                # Tradeoff: strict parsing with logging might be slow.
                # Let's assume for high perf we stick to standard ingest, 
                # maybe post-validate or relying on pandas 'warn'/'skip'.
                # *Self-Correction*: I'll stick to high perf ingest for now. 
                # If requirements strictly demand line numbers for every bad row, we might need a custom reader loop,
                # but that risks Python slowness. 
                # Let's proceed with DataFrame processing.
                
                try:
                    chunk = transform_data(chunk)
                except Exception as e:
                    # Transform errors shouldn't crash the pipeline; log and skip chunk.
                    # Line numbers within chunk are handled in ingest for row-level issues.
                    log_malformed_row(i * CHUNK_SIZE + 2, f"Transform error: {e}")
                    continue
                
                # 2. Accumulate Aggregates
                update_aggregates(agg_state, chunk)
                
                # Req 7: update progress based on *lines consumed* so the bar reaches 100%
                # even when malformed/invalid rows are skipped.
                lines_consumed = int(chunk.attrs.get("lines_consumed", len(chunk)))
                pbar.update(lines_consumed)
                
                # 3. Explicit GC (Req 12)
                del chunk
                gc.collect()
                
    except Exception as e:
        print(f"\nCritical Pipeline Error: {e}")
        # In production -> sys.exit(1)
        # But we want to see what happened.
        raise e

    print("\nFinalizing aggregates...")
    aggregates = finalize_aggregates(agg_state)

    # Req 9: deterministic checksums for each output table.
    # If reference checksums exist (env var path), verify; otherwise write new.
    checksum_path = os.environ.get("REFERENCE_CHECKSUMS")
    computed = compute_aggregate_checksums(aggregates)
    if checksum_path and os.path.exists(checksum_path):
        verify_checksums(computed, checksum_path)
    elif checksum_path:
        # Allow generating a reference in controlled runs.
        from checksum import write_checksums

        write_checksums(computed, checksum_path)
    
    print("Exporting to database...")
    export_to_database(aggregates)
    
    print("Pipeline complete!")

if __name__ == '__main__':
    main()
