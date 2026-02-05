# repository_before — Dashboard aggregation (reference implementation)

Reference implementation of the dashboard aggregation service. **Four passes over events; full sort for top 10.** Output and key order are correct; the optimization task is to preserve identical output while reducing passes and replacing the full sort with a bounded-cost selection (e.g. heap).

## Stack

- Python 3.11+
- CPython, single-threaded
- Reference: standard library only (`statistics.quantiles`)
- Endpoint: FastAPI (optional)
- Testing: in-memory fixtures, pytest

## Input / output

- **Input:** `List[dict]` — events with `timestamp`, `user_id`, `event_type`, `payload`. Optional `payload["value"]` for percentile.
- **Output:** `dict` with `active_users` (int), `event_counts` (dict[str, int], first-occurrence order), `percentiles_p95` (dict[str, float | None], same key order), `top_users` (list of `{user_id, count}`, max 10, tie-break by user_id).

## Reference behavior

- **Pass 1:** Active users (set of user_id).
- **Pass 2:** Event counts per event_type; dict built by iterating events so key order = first occurrence.
- **Pass 3:** For each event_type (in event_counts order), scan events for payload "value", then `statistics.quantiles(values, n=20)`; 95th = index 18 or last, rounded to 2 decimals.
- **Pass 4:** User counts, then **full sort** of (user_id, count) by (-count, user_id), take first 10.

The optimized implementation must **not** use a full sort for top 10; use heap or similar so cost is O(u) or O(u log 10).

## Run

```bash
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
uvicorn main:app --reload
```

POST `/dashboard` with body `{"events": [...]}` returns `compute_dashboard(events)`.

## Tests

```bash
pytest
```

In-memory fixtures only; no DB or network. Tests cover: empty list, single event (no value), first-occurrence key order, percentiles with values, top-users tie-break, `get_value` edge cases.

## Optimization goals (for after)

- Same JSON structure, values, and key order as reference (byte-for-byte for small fixture).
- Fewer passes over the event list.
- Top 10 via heap/selection, not full sort of all users.
- ≥ 40% latency improvement for large dataset (e.g. 100k events, 5k+ users, 10+ event types).
