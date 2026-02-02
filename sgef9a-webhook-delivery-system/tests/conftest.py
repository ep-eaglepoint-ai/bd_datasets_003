"""
Pytest configuration and fixtures for webhook delivery system tests.
"""

import pytest
import sys
import os

# Add the repository_after directory to the Python path
sys.path.insert(
    0, 
    os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'repository_after'))
)


@pytest.fixture(autouse=True)
def reset_random_seed():
    """Reset random seed for reproducible tests where needed."""
    import random
    random.seed(42)
    yield


@pytest.fixture
def sample_payload():
    """Provide a sample webhook payload."""
    return {
        "event": "order.created",
        "order_id": "12345",
        "customer": "customer@example.com",
        "items": [
            {"id": 1, "name": "Product A", "quantity": 2, "price": 29.99},
            {"id": 2, "name": "Product B", "quantity": 1, "price": 49.99},
        ],
        "total": 109.97,
        "currency": "USD",
    }


@pytest.fixture
def sample_webhook_url():
    """Provide a sample webhook URL."""
    return "https://example.com/webhook"


@pytest.fixture
def sample_events():
    """Provide sample webhook events."""
    return ["order.created", "order.updated", "order.cancelled"]
