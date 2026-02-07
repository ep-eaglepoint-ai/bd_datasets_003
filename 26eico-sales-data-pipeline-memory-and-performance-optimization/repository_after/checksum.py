import hashlib
import json
from pathlib import Path
from typing import Dict, Mapping

import pandas as pd


def _df_canonical_bytes(df: pd.DataFrame) -> bytes:
    """Deterministic representation of a DataFrame for checksumming.

    We sort columns and rows (by all columns) and serialize to CSV bytes with
    stable formatting.
    """
    if df is None:
        return b""

    if df.empty:
        # preserve schema
        cols = list(df.columns)
        return ("|".join(cols) + "\n").encode("utf-8")

    safe = df.copy()

    # Sort columns for stable ordering.
    safe = safe.reindex(sorted(safe.columns), axis=1)

    # Sort rows by all columns where possible.
    sort_cols = list(safe.columns)
    try:
        safe = safe.sort_values(by=sort_cols, kind="mergesort")
    except Exception:
        # If sort fails due to mixed/unorderable types, fall back to string repr.
        safe = safe.astype(str).sort_values(by=sort_cols, kind="mergesort")

    # Stable CSV formatting.
    csv_text = safe.to_csv(index=False, lineterminator="\n")
    return csv_text.encode("utf-8")


def compute_aggregate_checksums(aggregates: Mapping[str, pd.DataFrame]) -> Dict[str, str]:
    checksums: Dict[str, str] = {}
    for name, df in aggregates.items():
        md5 = hashlib.md5(_df_canonical_bytes(df)).hexdigest()
        checksums[name] = md5
    return checksums


def write_checksums(checksums: Mapping[str, str], path: str) -> None:
    Path(path).write_text(json.dumps(dict(checksums), indent=2, sort_keys=True))


def load_checksums(path: str) -> Dict[str, str]:
    return json.loads(Path(path).read_text())


def verify_checksums(computed: Mapping[str, str], reference_path: str) -> None:
    reference = load_checksums(reference_path)

    missing = sorted(set(reference.keys()) - set(computed.keys()))
    extra = sorted(set(computed.keys()) - set(reference.keys()))
    mismatched = sorted(
        k for k in set(reference.keys()) & set(computed.keys()) if reference[k] != computed[k]
    )

    if missing or extra or mismatched:
        parts = []
        if missing:
            parts.append(f"missing tables: {missing}")
        if extra:
            parts.append(f"unexpected tables: {extra}")
        if mismatched:
            parts.append(f"checksum mismatch: {mismatched}")
        raise AssertionError("Checksum verification failed (" + "; ".join(parts) + ")")
