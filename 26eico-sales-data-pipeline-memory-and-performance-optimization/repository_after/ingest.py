import csv
from dataclasses import dataclass
from typing import Dict, Iterator, List, Optional, Tuple

import numpy as np
import pandas as pd

from logger import log_malformed_row

# Column types for memory optimization
DTYPES: Dict[str, str] = {
    "transaction_id": "int32",
    # Req 4 calls out category for low-cardinality string columns including store_id.
    # store_id is typically low-cardinality vs rows; categorical helps memory.
    "store_id": "category",
    "product_id": "int32",
    "product_name": "string",
    "category": "category",
    "quantity": "int32",
    "unit_price": "float64",
    "discount_percent": "float64",
    "customer_id": "int32",
    "payment_method": "category",
    "region": "category",
}

# Req 1: default chunk size 100k-500k, configurable via constant
CHUNK_SIZE = 500_000

REQUIRED_COLUMNS: Tuple[str, ...] = (
    "transaction_id",
    "timestamp",
    "store_id",
    "product_id",
    "product_name",
    "category",
    "quantity",
    "unit_price",
    "discount_percent",
    "customer_id",
    "payment_method",
    "region",
)


@dataclass(frozen=True)
class CsvInfo:
    total_rows: int
    header_line_num: int = 1


def get_csv_info(filepath: str) -> CsvInfo:
    """Compute total data rows (excluding header) for an accurate progress bar."""
    # Fast-ish line count; for huge files this is still O(file), but it's required.
    with open(filepath, "rb") as f:
        # Count '\n' bytes
        total_lines = 0
        for block in iter(lambda: f.read(1024 * 1024), b""):
            total_lines += block.count(b"\n")

    # If last line doesn't end with newline, count may be off by 1; this is good enough.
    # total_lines includes header line.
    total_rows = max(0, total_lines - 1)
    return CsvInfo(total_rows=total_rows)


def _validate_and_log_rows(df: pd.DataFrame, line_numbers: np.ndarray) -> pd.DataFrame:
    """Row-level validation required by Req 8 (invalid data must be logged and skipped)."""
    # Negative quantity is invalid (prompt explicitly lists it as test case).
    invalid_qty = df["quantity"] < 0

    # discount out of expected range (be defensive)
    invalid_discount = (df["discount_percent"] < 0) | (df["discount_percent"] > 100)

    # Timestamp parse failures become NaT
    invalid_ts = df["timestamp"].isna()

    invalid_mask = invalid_qty | invalid_discount | invalid_ts
    if not invalid_mask.any():
        return df

    bad_df = df.loc[invalid_mask]
    bad_lines = line_numbers[invalid_mask.to_numpy()]

    # Log each bad row with line number, reason, and raw data (best-effort).
    # For performance, keep this purely for bad rows (which should be rare).
    for (idx, row), ln in zip(bad_df.iterrows(), bad_lines):
        reasons: List[str] = []
        if bool(invalid_qty.loc[idx]):
            reasons.append("negative quantity")
        if bool(invalid_discount.loc[idx]):
            reasons.append("discount_percent out of range")
        if bool(invalid_ts.loc[idx]):
            reasons.append("malformed timestamp")
        log_malformed_row(int(ln), ", ".join(reasons), raw_data=row.to_json())

    return df.loc[~invalid_mask]


def load_sales_data(filepath: str) -> Iterator[pd.DataFrame]:
    """Load sales data in chunks.

    - Uses `on_bad_lines` callback to log malformed CSV *lines* (Req 8)
    - Validates row content (negative qty / malformed timestamp) and logs+skips (Req 8)
    - Returns a lazy iterator of clean chunks (Req 1)
    """

    # Track file line numbers. Header is line 1; first data row is line 2.
    next_line_num = 2
    
    # We need a shared counter to track how many lines were skipped by the parser
    # during the current chunk read.
    skipped_in_current_chunk = 0

    def on_bad_lines(bad_line: List[str]) -> Optional[List[str]]:
        nonlocal next_line_num, skipped_in_current_chunk
        # Pandas passes the already-split fields.
        # This callback runs while parsing, before chunk DataFrames exist.
        # next_line_num points at the line currently being processed.
        # NOTE: with engine='python', this should run reasonably correctly.
        log_malformed_row(next_line_num + skipped_in_current_chunk, "malformed CSV row", raw_data=",".join(bad_line))
        skipped_in_current_chunk += 1
        return None  # skip

    # Parse with minimal type constraints initially to avoid crashing on type errors.
    # We will enforce types AFTER loading and coercion.
    # Keep strings as object/string to avoid int conversion failures.
    
    chunk_iter = pd.read_csv(
        filepath,
        chunksize=CHUNK_SIZE,
        # dtype=DTYPES,  <-- REMOVED to prevent crash on bad types
        # Parse dates still okay as 'coerce' (but read_csv parse_dates might crash or coerce? 
        # "parse_dates" usually safe if 'coerce' but read_csv param is just bool or list. 
        # To be safe, we parse dates manually too or rely on robust simple parsing.
        # Actually parse_dates in read_csv IS robust? No, if it fails it might just leave as object.
        # Let's clean up manually.
        
        on_bad_lines=on_bad_lines,
        engine="python", 
        keep_default_na=True,
    )

    for chunk in chunk_iter:
        # Calculate how many rows we got
        n = len(chunk)
        
        line_numbers = np.arange(next_line_num, next_line_num + n, dtype=np.int64)
        next_line_num += n + skipped_in_current_chunk
        skipped_in_current_chunk = 0

        # Ensure required columns exist
        missing = [c for c in REQUIRED_COLUMNS if c not in chunk.columns]
        if missing:
            raise ValueError(f"Missing required columns: {missing}")

        # Manual Coercion & Validation (Robustness)
        
        # 1. Coerce Numerics
        numeric_cols = ["quantity", "unit_price", "discount_percent", "transaction_id", "product_id", "customer_id"]
        for col in numeric_cols:
             chunk[col] = pd.to_numeric(chunk[col], errors='coerce')
             
        # 2. Coerce Timestamp
        chunk["timestamp"] = pd.to_datetime(chunk["timestamp"], errors="coerce")
        
        # 3. Log rows that became NaN due to type errors
        # Check for NaNs in required numeric columns (IDs, Quantity)
        # We need to do this BEFORE dropping them to log them.
        type_error_mask = (
            chunk["transaction_id"].isna() | 
            chunk["product_id"].isna() | 
            chunk["customer_id"].isna() | 
            chunk["quantity"].isna()
        )
        
        # We also need to combine this with _validate_and_log_rows logic,
        # or just log them here and let _validate drop them? 
        # _validate_and_log_rows expects the DF.
        # Let's add a specialized logging for type errors (NaNs) here.
        
        if type_error_mask.any():
            bad_df = chunk.loc[type_error_mask]
            bad_lines = line_numbers[type_error_mask.to_numpy()]
            for (idx, row), ln in zip(bad_df.iterrows(), bad_lines):
                log_malformed_row(int(ln), "invalid type (coerced to NaN)", raw_data=row.to_json())
        
        # Now we can drop the NaN rows so they don't break subsequent logic or validation
        # But wait, _validate_and_log_rows checks for negative quantity. 
        # if quantity is NaN, `NaN < 0` is False.
        # So we must handle NaNs logic.
        # Let's filter out the type-error rows FIRST.
        
        chunk = chunk.loc[~type_error_mask]
        line_numbers = line_numbers[~type_error_mask.to_numpy()]
        
        # 4. Validate and drop logic errors (negative qty, malformed date which is NaT)
        chunk = _validate_and_log_rows(chunk, line_numbers)
        
        # Now convert to final dtypes for valid rows
        for col, dtype in DTYPES.items():
            if col in chunk.columns:
                if dtype == "int32":
                     # safe cast because we should have handled NaNs?
                     # We dropped NaNs in type_error_mask
                     chunk[col] = chunk[col].astype(dtype)
                else:
                     chunk[col] = chunk[col].astype(dtype)

        # Attach line consumption info for progress bar correctness
        # Total lines consumed for this chunk iteration = n (rows in chunk) + skipped_in_current_chunk (bad CSV lines)
        # Note: 'chunk' here is smaller than 'n' if we dropped rows.
        # But for progress bar, we want to advance by the amount read from file.
        # That amount is `n + skipped_in_current_chunk` (where n was original len before filtering).
        # We need to capture original N.
        
        # Wait, 'n' was defined as `len(chunk)` at start of loop.
        # That `n` + `skipped` is what was consumed from the file reader.
        # Whether we drop them or not, we consumed them.
        chunk.attrs["lines_consumed"] = n + skipped_in_current_chunk

        if not chunk.empty:
            yield chunk
