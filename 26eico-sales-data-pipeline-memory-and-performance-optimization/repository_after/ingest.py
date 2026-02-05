import csv
from dataclasses import dataclass
from typing import Dict, Iterator, List, Tuple

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

    # Deterministic, exact line-number tracking:
    # - use csv.reader to stream physical lines
    # - log malformed CSV rows (wrong number of columns / parse errors) with exact line numbers
    # - build DataFrames in chunks
    with open(filepath, "r", newline="", encoding="utf-8") as f:
        reader = csv.reader(f)

        # Header (line 1)
        try:
            header = next(reader)
        except StopIteration:
            return

        expected_cols = list(REQUIRED_COLUMNS)
        # If file has different header ordering, still support it by using header mapping.
        # But we require all required columns to be present.
        missing = [c for c in expected_cols if c not in header]
        if missing:
            raise ValueError(f"Missing required columns: {missing}")

        col_index = {name: header.index(name) for name in expected_cols}

        # Accumulate raw rows and their exact file line numbers.
        buf_rows: List[List[str]] = []
        buf_line_nums: List[int] = []
        lines_consumed_since_flush = 0

        # First data line is line 2
        line_num = 1

        def flush() -> Iterator[pd.DataFrame]:
            nonlocal buf_rows, buf_line_nums, lines_consumed_since_flush
            if not buf_rows:
                return iter(())

            # Reorder columns into REQUIRED_COLUMNS order
            ordered = []
            for r in buf_rows:
                ordered.append([r[col_index[c]] for c in expected_cols])

            df = pd.DataFrame(ordered, columns=expected_cols)

            # Coerce dtypes
            # Store string/category columns first
            df["product_name"] = df["product_name"].astype("string")
            df["category"] = df["category"].astype("category")
            df["payment_method"] = df["payment_method"].astype("category")
            df["region"] = df["region"].astype("category")
            df["store_id"] = df["store_id"].astype("category")

            # Numeric conversions (invalid values become NaN then will be removed by validation)
            for c in ("transaction_id", "product_id", "customer_id", "quantity"):
                df[c] = pd.to_numeric(df[c], errors="coerce").astype("Int32")
            for c in ("unit_price", "discount_percent"):
                df[c] = pd.to_numeric(df[c], errors="coerce")

            # Timestamp conversion
            df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")

            # Convert pandas nullable Int32 to numpy int32 where possible (memory)
            # keep NaNs for validation filter
            # NOTE: We intentionally keep nullable until after validation.

            line_numbers = np.array(buf_line_nums, dtype=np.int64)
            df = _validate_and_log_rows(df, line_numbers)

            # After validation, cast ids/quantity to int32 (no missing expected now)
            for c in ("transaction_id", "product_id", "customer_id", "quantity"):
                if c in df.columns:
                    df[c] = df[c].astype("int32")
            df["unit_price"] = df["unit_price"].astype("float64")
            df["discount_percent"] = df["discount_percent"].astype("float64")

            # Attach how many physical CSV lines were consumed to produce this chunk.
            # This includes lines that were later dropped due to invalid values.
            df.attrs["lines_consumed"] = lines_consumed_since_flush

            buf_rows = []
            buf_line_nums = []
            lines_consumed_since_flush = 0
            return iter((df,))

        for row in reader:
            line_num += 1
            lines_consumed_since_flush += 1

            # Malformed CSV structure: wrong number of columns
            if len(row) != len(header):
                log_malformed_row(line_num, "malformed CSV row", raw_data=",".join(row))
                continue

            buf_rows.append(row)
            buf_line_nums.append(line_num)

            if len(buf_rows) >= CHUNK_SIZE:
                for out in flush():
                    yield out

        for out in flush():
            yield out
