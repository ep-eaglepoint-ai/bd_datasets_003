from typing import Any, Dict, List, Optional
from datetime import datetime

def sort_records(records: List[Dict[str, Any]], options: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    if options is None:
        options = {}

    stable = options.get("stable", True)
    nulls_last = options.get("nulls_last", True)

    def parse_score(record):
        try:
            return float(record.get("score", 0))
        except Exception:
            return 0.0

    def parse_time(record):
        raw = record.get("updated_at")
        if not raw:
            return datetime.min
        try:
            return datetime.fromisoformat(
                raw.replace("Z", "+00:00").replace(" ", "T")
            )
        except Exception:
            return datetime.min

    def normalize_name(record):
        name = record.get("name")
        if not isinstance(name, str):
            return ""
        return name.casefold()

    def normalize_id(record):
        return str(record.get("id", ""))

    def comparator(a, b):
        # score desc
        sa = parse_score(a)
        sb = parse_score(b)
        if sa != sb:
            return -1 if sa > sb else 1

        # updated_at desc
        ta = parse_time(a)
        tb = parse_time(b)
        if ta != tb:
            return -1 if ta > tb else 1

        # name asc
        na = normalize_name(a)
        nb = normalize_name(b)

        if nulls_last:
            if na == "" and nb != "":
                return 1
            if nb == "" and na != "":
                return -1

        if na != nb:
            return -1 if na < nb else 1

        # id asc (final tie-breaker)
        ia = normalize_id(a)
        ib = normalize_id(b)
        if ia != ib:
            return -1 if ia < ib else 1

        return 0

    # Python sort does not accept comparator directly
    # Emulate comparator-based sort using repeated key extraction
    indexed = list(enumerate(records))

    def sort_key(item):
        idx, record = item
        return (
            -parse_score(record),
            -parse_time(record).timestamp(),
            normalize_name(record) if not (nulls_last and normalize_name(record) == "") else "\uffff",
            normalize_id(record),
            idx if stable else 0,
        )

    return [r for _, r in sorted(indexed, key=sort_key)]
