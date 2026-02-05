"""
Convenience functions for session-related feature calculation.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional

from .core import CustomerActivityFeatures


def calculate_session_features(
    sessions: List[Dict[str, Any]], days: Optional[int] = None
) -> Dict[str, Any]:
    """
    Calculate session-related features from a list of session records.
    """
    manager = CustomerActivityFeatures()

    for session in sessions:
        if not isinstance(session, dict):
            continue

        duration = session.get("duration")
        if duration is None:
            continue

        device = session.get("device")
        date = session.get("date")

        if isinstance(date, str):
            try:
                date = datetime.fromisoformat(date.replace("Z", "+00:00"))
            except (ValueError, AttributeError):
                # Skip sessions with invalid date strings
                continue

        manager.add_session("temp_customer", duration, device, date)

    return {
        "frequency": manager.get_session_frequency("temp_customer", days or 30),
        "average_duration": manager.get_average_session_duration("temp_customer", days),
        "device_pattern": manager.get_device_usage_pattern("temp_customer", days),
        "primary_device": manager.get_primary_device("temp_customer", days),
    }


