"""
Convenience functions for purchase-related feature calculation.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional

from .core import CustomerActivityFeatures


def calculate_purchase_features(
    purchases: List[Dict[str, Any]], days: Optional[int] = None
) -> Dict[str, Any]:
    """
    Calculate purchase-related features from a list of purchase records.
    """
    manager = CustomerActivityFeatures()

    for purchase in purchases:
        if not isinstance(purchase, dict):
            continue

        value = purchase.get("value")
        date = purchase.get("date")

        if value is None:
            continue

        if isinstance(date, str):
            try:
                date = datetime.fromisoformat(date.replace("Z", "+00:00"))
            except (ValueError, AttributeError):
                date = None

        manager.add_purchase("temp_customer", value, date)

    return {
        "frequency": manager.get_purchase_frequency("temp_customer", days or 30),
        "average_order_value": manager.get_average_order_value("temp_customer", days),
        "recency_days": manager.get_purchase_recency("temp_customer"),
        "total_value": manager.get_total_purchase_value("temp_customer", days),
    }


