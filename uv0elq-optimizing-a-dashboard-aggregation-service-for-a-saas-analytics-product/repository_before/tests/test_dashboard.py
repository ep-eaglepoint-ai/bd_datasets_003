"""
Tests for the reference dashboard implementation.
In-memory fixtures; no database or network.
"""
import json
import pytest
from dashboard import compute_dashboard, get_value


def test_empty_events():
    out = compute_dashboard([])
    assert out == {
        "active_users": 0,
        "event_counts": {},
        "percentiles_p95": {},
        "top_users": [],
    }


def test_single_event_no_value():
    events = [
        {"timestamp": "2024-01-01T00:00:00Z", "user_id": "u1", "event_type": "click", "payload": {}},
    ]
    out = compute_dashboard(events)
    assert out["active_users"] == 1
    assert out["event_counts"] == {"click": 1}
    assert out["percentiles_p95"] == {"click": None}
    assert out["top_users"] == [{"user_id": "u1", "count": 1}]


def test_event_counts_first_occurrence_order():
    events = [
        {"user_id": "u1", "event_type": "b", "payload": {}},
        {"user_id": "u1", "event_type": "a", "payload": {}},
        {"user_id": "u1", "event_type": "b", "payload": {}},
    ]
    out = compute_dashboard(events)
    assert list(out["event_counts"].keys()) == ["b", "a"]
    assert out["event_counts"] == {"b": 2, "a": 1}
    assert list(out["percentiles_p95"].keys()) == ["b", "a"]


def test_percentile_with_values():
    events = [
        {"user_id": "u1", "event_type": "e1", "payload": {"value": 10}},
        {"user_id": "u1", "event_type": "e1", "payload": {"value": 20}},
        {"user_id": "u1", "event_type": "e1", "payload": {"value": 30}},
        {"user_id": "u1", "event_type": "e1", "payload": {"value": 40}},
        {"user_id": "u1", "event_type": "e1", "payload": {"value": 50}},
    ]
    out = compute_dashboard(events)
    assert out["percentiles_p95"]["e1"] is not None
    assert isinstance(out["percentiles_p95"]["e1"], (int, float))


def test_top_users_tie_break_by_user_id():
    events = [
        {"user_id": "u_b", "event_type": "e", "payload": {}},
        {"user_id": "u_b", "event_type": "e", "payload": {}},
        {"user_id": "u_a", "event_type": "e", "payload": {}},
        {"user_id": "u_a", "event_type": "e", "payload": {}},
    ]
    out = compute_dashboard(events)
    assert out["top_users"] == [
        {"user_id": "u_a", "count": 2},
        {"user_id": "u_b", "count": 2},
    ]


def test_get_value_missing_payload():
    assert get_value({"user_id": "u1", "event_type": "e"}) is None


def test_get_value_non_numeric():
    assert get_value({"payload": {"value": "x"}}) is None
