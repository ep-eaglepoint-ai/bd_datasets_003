"""
Comprehensive tests for Customer Activity Feature Module.

These tests verify that the module correctly calculates all customer activity features
including purchase behavior, session engagement, cart behavior, and support interactions.
Tests also verify edge case handling and scalability.
"""

import sys
import os
import pytest
from datetime import datetime, timedelta
from typing import Dict, Any

# Import the module from the appropriate repository
# The conftest.py handles adding the correct repository to sys.path based on --repo flag
try:
    from customer_activity_features import (
        CustomerActivityFeatures,
        calculate_purchase_features,
        calculate_session_features
    )
except ImportError:
    # Fallback: try to add both repositories to path
    repo_after = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'repository_after'))
    repo_before = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'repository_before'))
    
    for repo_path in [repo_after, repo_before]:
        if os.path.exists(repo_path) and repo_path not in sys.path:
            sys.path.insert(0, repo_path)
    
    try:
        from customer_activity_features import (
            CustomerActivityFeatures,
            calculate_purchase_features,
            calculate_session_features
        )
    except ImportError as e:
        pytest.skip(f"Could not import customer_activity_features module: {e}", allow_module_level=True)


class TestPurchaseBehavior:
    """Tests for purchase behavior features."""
    
    def test_purchase_frequency_empty(self):
        """Test purchase frequency with no purchases."""
        manager = CustomerActivityFeatures()
        assert manager.get_purchase_frequency('customer1') == 0.0
    
    def test_purchase_frequency_single_purchase(self):
        """Test purchase frequency with a single purchase."""
        manager = CustomerActivityFeatures()
        manager.add_purchase('customer1', 100.0, datetime.now() - timedelta(days=5))
        freq = manager.get_purchase_frequency('customer1', days=30)
        assert freq > 0.0
        assert isinstance(freq, float)
    
    def test_purchase_frequency_multiple_purchases(self):
        """Test purchase frequency with multiple purchases."""
        manager = CustomerActivityFeatures()
        base_date = datetime.now()
        for i in range(5):
            manager.add_purchase('customer1', 50.0, base_date - timedelta(days=i*7))
        freq = manager.get_purchase_frequency('customer1', days=30)
        assert freq > 0.0
    
    def test_average_order_value_empty(self):
        """Test average order value with no purchases."""
        manager = CustomerActivityFeatures()
        assert manager.get_average_order_value('customer1') == 0.0
    
    def test_average_order_value_single(self):
        """Test average order value with single purchase."""
        manager = CustomerActivityFeatures()
        manager.add_purchase('customer1', 150.0)
        assert manager.get_average_order_value('customer1') == 150.0
    
    def test_average_order_value_multiple(self):
        """Test average order value with multiple purchases."""
        manager = CustomerActivityFeatures()
        manager.add_purchase('customer1', 100.0)
        manager.add_purchase('customer1', 200.0)
        manager.add_purchase('customer1', 150.0)
        avg = manager.get_average_order_value('customer1')
        assert avg == 150.0
    
    def test_average_order_value_with_time_filter(self):
        """Test average order value with time filtering."""
        manager = CustomerActivityFeatures()
        old_date = datetime.now() - timedelta(days=100)
        recent_date = datetime.now() - timedelta(days=5)
        manager.add_purchase('customer1', 50.0, old_date)
        manager.add_purchase('customer1', 200.0, recent_date)
        avg = manager.get_average_order_value('customer1', days=30)
        assert avg == 200.0
    
    def test_purchase_recency_no_purchases(self):
        """Test purchase recency with no purchases."""
        manager = CustomerActivityFeatures()
        assert manager.get_purchase_recency('customer1') is None
    
    def test_purchase_recency_recent(self):
        """Test purchase recency with recent purchase."""
        manager = CustomerActivityFeatures()
        purchase_date = datetime.now() - timedelta(days=5)
        manager.add_purchase('customer1', 100.0, purchase_date)
        recency = manager.get_purchase_recency('customer1')
        assert recency is not None
        assert 4 <= recency <= 6  # Allow small time variance
    
    def test_total_purchase_value(self):
        """Test total purchase value calculation."""
        manager = CustomerActivityFeatures()
        manager.add_purchase('customer1', 100.0)
        manager.add_purchase('customer1', 200.0)
        manager.add_purchase('customer1', 150.0)
        total = manager.get_total_purchase_value('customer1')
        assert total == 450.0
    
    def test_purchase_invalid_data(self):
        """Test handling of invalid purchase data."""
        manager = CustomerActivityFeatures()
        manager.add_purchase('customer1', -10.0)  # Negative value
        manager.add_purchase('customer1', None)  # None value
        manager.add_purchase(None, 100.0)  # None customer_id
        assert manager.get_purchase_frequency('customer1') == 0.0


class TestSessionEngagement:
    """Tests for session engagement features."""
    
    def test_session_frequency_empty(self):
        """Test session frequency with no sessions."""
        manager = CustomerActivityFeatures()
        assert manager.get_session_frequency('customer1') == 0.0
    
    def test_session_frequency_multiple(self):
        """Test session frequency with multiple sessions."""
        manager = CustomerActivityFeatures()
        base_date = datetime.now()
        for i in range(10):
            manager.add_session('customer1', 300.0, 'mobile', base_date - timedelta(days=i))
        freq = manager.get_session_frequency('customer1', days=30)
        assert freq > 0.0
    
    def test_average_session_duration_empty(self):
        """Test average session duration with no sessions."""
        manager = CustomerActivityFeatures()
        assert manager.get_average_session_duration('customer1') == 0.0
    
    def test_average_session_duration(self):
        """Test average session duration calculation."""
        manager = CustomerActivityFeatures()
        manager.add_session('customer1', 100.0)
        manager.add_session('customer1', 200.0)
        manager.add_session('customer1', 300.0)
        avg = manager.get_average_session_duration('customer1')
        assert avg == 200.0
    
    def test_session_days_filtering(self):
        """Days parameter should filter sessions used in metrics."""
        manager = CustomerActivityFeatures()
        base_date = datetime.now()
        manager.add_session('customer1', 100.0, 'mobile', base_date - timedelta(days=60))
        manager.add_session('customer1', 300.0, 'mobile', base_date - timedelta(days=5))
        all_time_freq = manager.get_session_frequency('customer1', days=90)
        recent_freq = manager.get_session_frequency('customer1', days=30)
        # With normalization to "per month", recent frequency should be higher
        assert recent_freq > all_time_freq
    
    def test_device_usage_pattern(self):
        """Test device usage pattern calculation."""
        manager = CustomerActivityFeatures()
        manager.add_session('customer1', 100.0, 'mobile')
        manager.add_session('customer1', 100.0, 'mobile')
        manager.add_session('customer1', 100.0, 'desktop')
        pattern = manager.get_device_usage_pattern('customer1')
        assert pattern['mobile'] == 2
        assert pattern['desktop'] == 1
    
    def test_primary_device(self):
        """Test primary device identification."""
        manager = CustomerActivityFeatures()
        manager.add_session('customer1', 100.0, 'mobile')
        manager.add_session('customer1', 100.0, 'mobile')
        manager.add_session('customer1', 100.0, 'desktop')
        primary = manager.get_primary_device('customer1')
        assert primary == 'mobile'
    
    def test_primary_device_no_sessions(self):
        """Test primary device with no sessions."""
        manager = CustomerActivityFeatures()
        assert manager.get_primary_device('customer1') is None
    
    def test_session_invalid_data(self):
        """Test handling of invalid session data."""
        manager = CustomerActivityFeatures()
        manager.add_session('customer1', -10.0)  # Negative duration
        manager.add_session(None, 100.0)  # None customer_id
        assert manager.get_session_frequency('customer1') == 0.0


class TestCartBehavior:
    """Tests for cart behavior features."""
    
    def test_abandoned_cart_count_empty(self):
        """Test abandoned cart count with no cart events."""
        manager = CustomerActivityFeatures()
        assert manager.get_abandoned_cart_count('customer1') == 0
    
    def test_abandoned_cart_count(self):
        """Test abandoned cart count calculation."""
        manager = CustomerActivityFeatures()
        manager.add_cart_event('customer1', 'abandoned', 50.0)
        manager.add_cart_event('customer1', 'abandoned', 75.0)
        manager.add_cart_event('customer1', 'converted', 100.0)
        count = manager.get_abandoned_cart_count('customer1')
        assert count == 2
    
    def test_cart_conversion_ratio_empty(self):
        """Test cart conversion ratio with no carts."""
        manager = CustomerActivityFeatures()
        assert manager.get_cart_conversion_ratio('customer1') == 0.0
    
    def test_cart_conversion_ratio_all_converted(self):
        """Test cart conversion ratio with all converted."""
        manager = CustomerActivityFeatures()
        manager.add_cart_event('customer1', 'converted', 100.0)
        manager.add_cart_event('customer1', 'converted', 150.0)
        ratio = manager.get_cart_conversion_ratio('customer1')
        assert ratio == 1.0
    
    def test_cart_conversion_ratio_mixed(self):
        """Test cart conversion ratio with mixed events."""
        manager = CustomerActivityFeatures()
        manager.add_cart_event('customer1', 'converted', 100.0)
        manager.add_cart_event('customer1', 'abandoned', 50.0)
        manager.add_cart_event('customer1', 'abandoned', 75.0)
        ratio = manager.get_cart_conversion_ratio('customer1')
        assert ratio == pytest.approx(1.0 / 3.0, rel=1e-9)
    
    def test_abandoned_cart_value(self):
        """Test abandoned cart value calculation."""
        manager = CustomerActivityFeatures()
        manager.add_cart_event('customer1', 'abandoned', 50.0)
        manager.add_cart_event('customer1', 'abandoned', 75.0)
        manager.add_cart_event('customer1', 'converted', 100.0)
        value = manager.get_abandoned_cart_value('customer1')
        assert value == 125.0
    
    def test_cart_days_filtering(self):
        """Days parameter should filter cart events used in metrics."""
        manager = CustomerActivityFeatures()
        base_date = datetime.now()
        manager.add_cart_event('customer1', 'abandoned', 40.0, base_date - timedelta(days=60))
        manager.add_cart_event('customer1', 'abandoned', 60.0, base_date - timedelta(days=5))
        all_time_count = manager.get_abandoned_cart_count('customer1', days=90)
        recent_count = manager.get_abandoned_cart_count('customer1', days=30)
        assert all_time_count > recent_count
    
    def test_cart_invalid_data(self):
        """Test handling of invalid cart data."""
        manager = CustomerActivityFeatures()
        manager.add_cart_event('customer1', 'invalid_type', 50.0)  # Invalid type
        manager.add_cart_event('customer1', 'abandoned', -10.0)  # Negative value
        manager.add_cart_event(None, 'abandoned', 50.0)  # None customer_id
        assert manager.get_abandoned_cart_count('customer1') == 0


class TestSupportInteractions:
    """Tests for support interaction features."""
    
    def test_support_ticket_count_empty(self):
        """Test support ticket count with no tickets."""
        manager = CustomerActivityFeatures()
        assert manager.get_support_ticket_count('customer1') == 0
    
    def test_support_ticket_count(self):
        """Test support ticket count calculation."""
        manager = CustomerActivityFeatures()
        manager.add_support_interaction('customer1', 'ticket1')
        manager.add_support_interaction('customer1', 'ticket2')
        manager.add_support_interaction('customer1', 'ticket3')
        count = manager.get_support_ticket_count('customer1')
        assert count == 3
    
    def test_average_response_time_empty(self):
        """Test average response time with no tickets."""
        manager = CustomerActivityFeatures()
        assert manager.get_average_response_time('customer1') is None
    
    def test_average_response_time_no_times(self):
        """Test average response time when times are not provided."""
        manager = CustomerActivityFeatures()
        manager.add_support_interaction('customer1', 'ticket1')
        assert manager.get_average_response_time('customer1') is None
    
    def test_average_response_time(self):
        """Test average response time calculation."""
        manager = CustomerActivityFeatures()
        manager.add_support_interaction('customer1', 'ticket1', response_time_hours=2.0)
        manager.add_support_interaction('customer1', 'ticket2', response_time_hours=4.0)
        manager.add_support_interaction('customer1', 'ticket3', response_time_hours=6.0)
        avg = manager.get_average_response_time('customer1')
        assert avg == 4.0
    
    def test_escalation_count(self):
        """Test escalation count calculation."""
        manager = CustomerActivityFeatures()
        manager.add_support_interaction('customer1', 'ticket1', escalated=False)
        manager.add_support_interaction('customer1', 'ticket2', escalated=True)
        manager.add_support_interaction('customer1', 'ticket3', escalated=True)
        count = manager.get_escalation_count('customer1')
        assert count == 2
    
    def test_escalation_ratio(self):
        """Test escalation ratio calculation."""
        manager = CustomerActivityFeatures()
        manager.add_support_interaction('customer1', 'ticket1', escalated=False)
        manager.add_support_interaction('customer1', 'ticket2', escalated=True)
        manager.add_support_interaction('customer1', 'ticket3', escalated=True)
        ratio = manager.get_escalation_ratio('customer1')
        assert ratio == pytest.approx(2.0 / 3.0, rel=1e-9)
    
    def test_escalation_ratio_empty(self):
        """Test escalation ratio with no tickets."""
        manager = CustomerActivityFeatures()
        assert manager.get_escalation_ratio('customer1') == 0.0

    def test_support_days_filtering(self):
        """Days parameter should filter support interactions used in metrics."""
        manager = CustomerActivityFeatures()
        base_date = datetime.now()
        manager.add_support_interaction('customer1', 'ticket-old', interaction_date=base_date - timedelta(days=60))
        manager.add_support_interaction('customer1', 'ticket-new', interaction_date=base_date - timedelta(days=5))
        all_time_count = manager.get_support_ticket_count('customer1', days=90)
        recent_count = manager.get_support_ticket_count('customer1', days=30)
        assert all_time_count > recent_count


class TestTradeoffIndicators:
    """Tests for trade-off indicators between short-term and long-term activity."""
    
    def test_activity_retention_tradeoff_empty(self):
        """Test trade-off indicators with no customer data."""
        manager = CustomerActivityFeatures()
        tradeoff = manager.get_activity_retention_tradeoff('customer1')
        assert isinstance(tradeoff, dict)
        assert 'retention_concern' in tradeoff
        assert tradeoff['retention_concern'] == False
    
    def test_activity_retention_tradeoff_active_customer(self):
        """Test trade-off indicators for active customer."""
        manager = CustomerActivityFeatures()
        base_date = datetime.now()
        # Add recent purchases
        for i in range(3):
            manager.add_purchase('customer1', 100.0, base_date - timedelta(days=i*7))
        # Add recent sessions
        for i in range(10):
            manager.add_session('customer1', 300.0, 'mobile', base_date - timedelta(days=i))
        
        tradeoff = manager.get_activity_retention_tradeoff('customer1')
        assert isinstance(tradeoff, dict)
        assert 'high_short_term_activity' in tradeoff
        assert 'retention_concern' in tradeoff
    
    def test_activity_retention_tradeoff_declining_engagement(self):
        """Test trade-off indicators for customer with declining engagement."""
        manager = CustomerActivityFeatures()
        base_date = datetime.now()
        # Add many old purchases
        for i in range(10):
            manager.add_purchase('customer1', 100.0, base_date - timedelta(days=60+i))
        # Add few recent purchases
        manager.add_purchase('customer1', 100.0, base_date - timedelta(days=5))
        
        tradeoff = manager.get_activity_retention_tradeoff('customer1')
        assert isinstance(tradeoff, dict)
        assert 'declining_engagement' in tradeoff
    
    def test_activity_retention_tradeoff_high_support_risk(self):
        """Test trade-off indicators with high support risk."""
        manager = CustomerActivityFeatures()
        # Add multiple escalated tickets
        for i in range(5):
            manager.add_support_interaction('customer1', f'ticket{i}', escalated=True)
        
        tradeoff = manager.get_activity_retention_tradeoff('customer1')
        assert tradeoff.get('support_risk', False) == True
    
    def test_activity_retention_tradeoff_cart_abandonment(self):
        """Test trade-off indicators with cart abandonment."""
        manager = CustomerActivityFeatures()
        # Add multiple abandoned carts
        for i in range(5):
            manager.add_cart_event('customer1', 'abandoned', 50.0)
        manager.add_cart_event('customer1', 'converted', 100.0)
        
        tradeoff = manager.get_activity_retention_tradeoff('customer1')
        assert tradeoff.get('cart_abandonment_risk', False) == True

    def test_retention_concern_true_for_long_recency(self):
        """Retention concern should be true when recency is very high."""
        manager = CustomerActivityFeatures()
        old_date = datetime.now() - timedelta(days=90)
        manager.add_purchase('customer1', 100.0, old_date)
        tradeoff = manager.get_activity_retention_tradeoff('customer1')
        assert tradeoff['retention_concern'] is True

    def test_activity_trend_values(self):
        """Validate activity_trend transitions between inactive, stable, and declining."""
        manager = CustomerActivityFeatures()

        # Inactive: no activity
        tradeoff_inactive = manager.get_activity_retention_tradeoff('customer1')
        assert tradeoff_inactive['activity_trend'] == 'inactive'

        # Stable: strong recent and long-term activity with similar frequencies
        base_date = datetime.now()
        for i in range(6):
            manager.add_purchase('customer2', 100.0, base_date - timedelta(days=i * 10))
            manager.add_session('customer2', 300.0, 'mobile', base_date - timedelta(days=i * 10))
        tradeoff_stable = manager.get_activity_retention_tradeoff('customer2')
        assert tradeoff_stable['activity_trend'] == 'stable'

        # Declining: strong long-term purchases, weak recent purchases
        for i in range(10):
            manager.add_purchase('customer3', 100.0, base_date - timedelta(days=60 + i))
        manager.add_purchase('customer3', 100.0, base_date - timedelta(days=5))
        tradeoff_declining = manager.get_activity_retention_tradeoff('customer3')
        assert tradeoff_declining['activity_trend'] == 'declining'


class TestFeatureSummary:
    """Tests for feature summary and retrieval functions."""
    
    def test_get_all_features_empty(self):
        """Test getting all features for customer with no data."""
        manager = CustomerActivityFeatures()
        features = manager.get_all_features('customer1')
        assert isinstance(features, dict)
        assert 'purchase_frequency' in features
        assert 'session_frequency' in features
        assert 'cart_conversion_ratio' in features
        assert 'support_ticket_count' in features
    
    def test_get_all_features_comprehensive(self):
        """Test getting all features with comprehensive data."""
        manager = CustomerActivityFeatures()
        base_date = datetime.now()
        
        # Add various activities
        manager.add_purchase('customer1', 100.0, base_date - timedelta(days=5))
        manager.add_session('customer1', 300.0, 'mobile', base_date - timedelta(days=2))
        manager.add_cart_event('customer1', 'converted', 100.0, base_date - timedelta(days=1))
        manager.add_support_interaction('customer1', 'ticket1', response_time_hours=2.0)
        manager.set_customer_metadata('customer1', {'segment': 'premium'})
        
        features = manager.get_all_features('customer1')
        assert isinstance(features, dict)
        assert features['purchase_frequency'] > 0
        assert features['session_frequency'] > 0
        assert 'metadata' in features
        assert features['metadata']['segment'] == 'premium'
    
    def test_get_feature_summary(self):
        """Test feature summary generation."""
        manager = CustomerActivityFeatures()
        manager.add_purchase('customer1', 100.0)
        manager.add_session('customer1', 300.0, 'mobile')
        
        summary = manager.get_feature_summary('customer1')
        assert isinstance(summary, dict)
        assert summary['customer_id'] == 'customer1'
        assert 'purchase_metrics' in summary
        assert 'engagement_metrics' in summary
        assert 'cart_metrics' in summary
        assert 'support_metrics' in summary
        assert 'retention_indicators' in summary


class TestCohortFeatures:
    """Tests for cohort-level feature calculation and summaries."""

    def test_get_cohort_features_empty(self):
        manager = CustomerActivityFeatures()
        cohort = manager.get_cohort_features([])
        assert cohort == {}

    def test_get_cohort_features_and_summary(self):
        manager = CustomerActivityFeatures()
        base_date = datetime.now()
        manager.add_purchase('c1', 100.0, base_date - timedelta(days=5))
        manager.add_purchase('c2', 200.0, base_date - timedelta(days=5))
        manager.add_session('c1', 300.0, 'mobile', base_date - timedelta(days=2))
        manager.add_session('c2', 600.0, 'desktop', base_date - timedelta(days=2))

        cohort = manager.get_cohort_features(['c1', 'c2'])
        assert set(cohort.keys()) == {'c1', 'c2'}
        assert 'purchase_frequency' in cohort['c1']

        summary = manager.get_cohort_summary(['c1', 'c2'])
        assert summary['size'] == 2
        aggregates = summary['aggregates']
        assert 'average_session_duration' in aggregates
        assert aggregates['average_session_duration'] >= 300.0

    def test_get_all_features_days_parameter_effect(self):
        """Days parameter on get_all_features should change time-windowed metrics."""
        manager = CustomerActivityFeatures()
        base_date = datetime.now()
        # Purchases: one old, one recent
        manager.add_purchase('customer1', 50.0, base_date - timedelta(days=60))
        manager.add_purchase('customer1', 150.0, base_date - timedelta(days=5))
        # Sessions: one old, one recent
        manager.add_session('customer1', 100.0, 'mobile', base_date - timedelta(days=60))
        manager.add_session('customer1', 300.0, 'mobile', base_date - timedelta(days=5))
        # Cart: one old abandoned, one recent converted
        manager.add_cart_event('customer1', 'abandoned', 40.0, base_date - timedelta(days=60))
        manager.add_cart_event('customer1', 'converted', 80.0, base_date - timedelta(days=5))
        # Support: one old, one recent
        manager.add_support_interaction('customer1', 'ticket-old', response_time_hours=2.0, interaction_date=base_date - timedelta(days=60))
        manager.add_support_interaction('customer1', 'ticket-new', response_time_hours=4.0, interaction_date=base_date - timedelta(days=5))

        all_time = manager.get_all_features('customer1', days=None)
        recent = manager.get_all_features('customer1', days=30)

        assert all_time['total_purchase_value'] > recent['total_purchase_value']
        assert all_time['support_ticket_count'] > recent['support_ticket_count']
        assert all_time['abandoned_cart_count'] >= recent['abandoned_cart_count']


class TestConvenienceFunctions:
    """Tests for convenience functions."""
    
    def test_calculate_purchase_features(self):
        """Test calculate_purchase_features convenience function."""
        purchases = [
            {'value': 100.0, 'date': datetime.now() - timedelta(days=5)},
            {'value': 200.0, 'date': datetime.now() - timedelta(days=3)},
            {'value': 150.0, 'date': datetime.now() - timedelta(days=1)}
        ]
        features = calculate_purchase_features(purchases)
        assert isinstance(features, dict)
        assert 'frequency' in features
        assert 'average_order_value' in features
        assert 'recency_days' in features
        assert 'total_value' in features
        assert features['average_order_value'] == 150.0
    
    def test_calculate_purchase_features_empty(self):
        """Test calculate_purchase_features with empty list."""
        features = calculate_purchase_features([])
        assert isinstance(features, dict)
        assert features['frequency'] == 0.0
    
    def test_calculate_session_features(self):
        """Test calculate_session_features convenience function."""
        sessions = [
            {'duration': 100.0, 'device': 'mobile', 'date': datetime.now() - timedelta(days=2)},
            {'duration': 200.0, 'device': 'desktop', 'date': datetime.now() - timedelta(days=1)},
            {'duration': 300.0, 'device': 'mobile', 'date': datetime.now()}
        ]
        features = calculate_session_features(sessions)
        assert isinstance(features, dict)
        assert 'frequency' in features
        assert 'average_duration' in features
        assert 'device_pattern' in features
        assert 'primary_device' in features
        assert features['average_duration'] == 200.0
        assert features['primary_device'] == 'mobile'

    def test_calculate_purchase_features_malformed(self):
        """Malformed purchase records should be safely ignored."""
        purchases = [
            123,
            {'value': None, 'date': datetime.now()},
            {'amount': 50.0},
            {'value': 100.0, 'date': 'invalid-date'},
            {'value': 200.0, 'date': datetime.now() - timedelta(days=1)},
        ]
        features = calculate_purchase_features(purchases)
        assert isinstance(features, dict)
        # Only the valid record should meaningfully contribute
        assert features['total_value'] >= 200.0

    def test_calculate_session_features_malformed(self):
        """Malformed session records should be safely ignored."""
        sessions = [
            "not-a-dict",
            {'duration': None, 'device': 'mobile'},
            {'length': 100.0},
            {'duration': 150.0, 'device': 'desktop', 'date': 'invalid-date'},
            {'duration': 200.0, 'device': 'mobile', 'date': datetime.now()},
        ]
        features = calculate_session_features(sessions)
        assert isinstance(features, dict)
        assert features['average_duration'] >= 200.0


class TestEdgeCases:
    """Tests for edge case handling."""
    
    def test_none_customer_id(self):
        """Test handling of None customer_id."""
        manager = CustomerActivityFeatures()
        assert manager.get_purchase_frequency(None) == 0.0
        assert manager.get_session_frequency(None) == 0.0
        assert manager.get_all_features(None) == {}
    
    def test_empty_string_customer_id(self):
        """Test handling of empty string customer_id."""
        manager = CustomerActivityFeatures()
        assert manager.get_purchase_frequency('') == 0.0
        assert manager.get_session_frequency('') == 0.0
    
    def test_invalid_days_parameter(self):
        """Test handling of invalid days parameter."""
        manager = CustomerActivityFeatures()
        manager.add_purchase('customer1', 100.0)
        assert manager.get_purchase_frequency('customer1', days=0) == 0.0
        assert manager.get_purchase_frequency('customer1', days=-10) == 0.0
    
    def test_missing_data_fields(self):
        """Test handling of missing data fields."""
        manager = CustomerActivityFeatures()
        # Add purchase with missing date
        manager.add_purchase('customer1', 100.0, None)
        # Should still work (uses current time)
        assert manager.get_purchase_frequency('customer1') > 0.0
    
    def test_metadata_handling(self):
        """Test customer metadata handling."""
        manager = CustomerActivityFeatures()
        manager.set_customer_metadata('customer1', {'segment': 'premium', 'region': 'US'})
        features = manager.get_all_features('customer1')
        assert 'metadata' in features
        assert features['metadata']['segment'] == 'premium'
    
    def test_unusual_metadata_sanitization(self):
        """Unusual metadata types should be safely sanitized and JSON-serializable."""
        manager = CustomerActivityFeatures()
        metadata = {
            'segment': 'vip',
            'joined_at': datetime.now(),
            'preferences': {'colors': ['red', 'blue']},
            'object': object(),
        }
        manager.set_customer_metadata('customer1', metadata)
        features = manager.get_all_features('customer1')
        meta = features['metadata']
        assert isinstance(meta['joined_at'], str)
        assert meta['preferences']['colors'] == ['red', 'blue']
        assert isinstance(meta['object'], str)
    
    def test_time_filtering_edge_cases(self):
        """Test time filtering with edge cases."""
        manager = CustomerActivityFeatures()
        old_date = datetime.now() - timedelta(days=100)
        recent_date = datetime.now() - timedelta(days=5)
        
        manager.add_purchase('customer1', 50.0, old_date)
        manager.add_purchase('customer1', 200.0, recent_date)
        
        # Test with days=None (all time)
        avg_all = manager.get_average_order_value('customer1', days=None)
        assert avg_all == 125.0
        
        # Test with days filter
        avg_recent = manager.get_average_order_value('customer1', days=30)
        assert avg_recent == 200.0


class TestScalability:
    """Tests to ensure scalability (no hardcoded values)."""
    
    def test_multiple_customers(self):
        """Test handling multiple customers independently."""
        manager = CustomerActivityFeatures()
        
        # Add data for multiple customers
        for i in range(100):
            customer_id = f'customer_{i}'
            manager.add_purchase(customer_id, 100.0 * (i + 1))
            manager.add_session(customer_id, 300.0, 'mobile')
        
        # Verify each customer's data is independent
        assert manager.get_average_order_value('customer_0') == 100.0
        assert manager.get_average_order_value('customer_99') == 10000.0
    
    def test_large_purchase_history(self):
        """Test handling large purchase history."""
        manager = CustomerActivityFeatures()
        base_date = datetime.now()
        
        # Add many purchases
        for i in range(1000):
            manager.add_purchase('customer1', 100.0, base_date - timedelta(days=i))
        
        # Should still calculate correctly
        freq = manager.get_purchase_frequency('customer1', days=30)
        assert freq > 0.0
        assert manager.get_total_purchase_value('customer1') == 100000.0
    
    def test_large_cart_history(self):
        """Test handling large cart history."""
        manager = CustomerActivityFeatures()
        base_date = datetime.now()
        for i in range(1000):
            event_type = 'converted' if i % 2 == 0 else 'abandoned'
            manager.add_cart_event('customer1', event_type, 50.0, base_date - timedelta(days=i % 60))
        assert manager.get_abandoned_cart_count('customer1') > 0
        assert manager.get_cart_conversion_ratio('customer1') > 0.0

    def test_large_support_history(self):
        """Test handling large support history."""
        manager = CustomerActivityFeatures()
        base_date = datetime.now()
        for i in range(1000):
            escalated = (i % 3 == 0)
            manager.add_support_interaction(
                'customer1',
                f'ticket-{i}',
                response_time_hours=1.0,
                escalated=escalated,
                interaction_date=base_date - timedelta(days=i % 60),
            )
        assert manager.get_support_ticket_count('customer1') == 1000
        assert manager.get_escalation_count('customer1') > 0
    
    def test_no_hardcoded_customer_data(self):
        """Test that no customer data is hardcoded."""
        manager = CustomerActivityFeatures()
        # Empty manager should return zeros/None for any customer
        assert manager.get_purchase_frequency('any_customer_id') == 0.0
        assert manager.get_purchase_recency('another_customer_id') is None

