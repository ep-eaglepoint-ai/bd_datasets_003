"""
Public API for the Customer Activity Feature Module.

This module exposes the stable interface used by the tests and external code:

- CustomerActivityFeatures: main feature manager class
- calculate_purchase_features: convenience function for purchases
- calculate_session_features: convenience function for sessions

The implementation is organized in the internal `customer_activity` package.
"""

from customer_activity.core import CustomerActivityFeatures
from customer_activity.purchase_features import calculate_purchase_features
from customer_activity.session_features import calculate_session_features

__all__ = [
    "CustomerActivityFeatures",
    "calculate_purchase_features",
    "calculate_session_features",
]
