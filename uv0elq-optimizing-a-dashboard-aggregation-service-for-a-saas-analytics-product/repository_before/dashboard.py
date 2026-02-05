"""
Dashboard aggregation: reference implementation.
Four passes over events; full sort for top 10. Correct output and key order.
Optimization task: preserve identical output while reducing passes and
replacing full sort with bounded-cost selection (e.g. heap).
"""
from statistics import quantiles


def get_value(event: dict) -> float | None:
    """Extract numeric 'value' from event payload if present and numeric."""
    try:
        val = event.get("payload", {}).get("value")
        if val is None:
            return None
        return float(val)
    except (TypeError, ValueError):
        return None


def compute_dashboard(events: list[dict]) -> dict:
    """
    Compute dashboard metrics from a list of events.
    events: list of dicts with keys timestamp, user_id, event_type, payload.
    Returns dict with active_users, event_counts, percentiles_p95, top_users.
    Keys in event_counts and percentiles_p95 are in first-occurrence order of event_type.
    """
    if not events:
        return {
            "active_users": 0,
            "event_counts": {},
            "percentiles_p95": {},
            "top_users": [],
        }

    # Pass 1: active users
    active_user_ids = {e["user_id"] for e in events}
    active_users = len(active_user_ids)

    # Pass 2: event counts per event_type (dict insertion = first-occurrence order)
    event_counts: dict[str, int] = {}
    for e in events:
        et = e["event_type"]
        event_counts[et] = event_counts.get(et, 0) + 1

    # Pass 3: 95th percentile per event_type (iterate event_counts to preserve key order)
    percentiles_p95: dict[str, float | None] = {}
    for et in event_counts:
        values = []
        for e in events:
            if e["event_type"] != et:
                continue
            v = get_value(e)
            if v is not None:
                values.append(v)
        if not values:
            percentiles_p95[et] = None
        else:
            q = quantiles(values, n=20)
            percentiles_p95[et] = round(q[18], 2) if len(q) >= 19 else round(q[-1], 2)

    # Pass 4: events per user, then top 10 (reference uses full sort; optimized must not)
    user_counts: dict[str, int] = {}
    for e in events:
        uid = e["user_id"]
        user_counts[uid] = user_counts.get(uid, 0) + 1
    sorted_users = sorted(
        user_counts.items(),
        key=lambda x: (-x[1], x[0]),
    )
    top_users = [{"user_id": u, "count": c} for u, c in sorted_users[:10]]

    return {
        "active_users": active_users,
        "event_counts": event_counts,
        "percentiles_p95": percentiles_p95,
        "top_users": top_users,
    }
