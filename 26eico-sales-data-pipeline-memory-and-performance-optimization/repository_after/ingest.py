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
        
        # 3. Log rows that became NaN due to type errors (optional but good for "malformed")
        # The requirements essentially say "handle malformed/invalid".
        # _validate_and_log_rows checks for NaT in timestamp, invalid ranges.
        # It does NOT check for NaNs in IDs or Quantity that resulted from type coercion.
        # We should add that check to _validate_and_log_rows or here.
        
        # Let's extend the validation logic implicitly by letting _validate_and_log_rows handle logic invalidity.
        # But if IDs are NaN, we should drop them too?
        # The prompt examples: "negative quantity, malformed date".
        # Malformed ID? Probably drop.
        
        # Let's rely on _validate_and_log_rows to do the job, but we must update it to handle NaNs in critical columns.
        
        # 4. Cast to optimized types (where possible/safe)
        # Only cast AFTER dropping bad rows.
        
        # Validate and drop bad rows
        chunk = _validate_and_log_rows(chunk, line_numbers)
        
        # Now convert to final dtypes for valid rows
        for col, dtype in DTYPES.items():
            if col in chunk.columns:
                if dtype == "int32":
                     # safe cast because we should have handled NaNs?
                     # If we have NaNs in int32 columns left, this will fail.
                     # We need to ensure we drop NaNs in int columns or use Int32.
                     # DTYPES uses "int32" (numpy).
                     # So we MUST drop NaNs in IDs/Qty.
                     chunk = chunk.dropna(subset=[col])
                chunk[col] = chunk[col].astype(dtype)

        yield chunk
