"""
Customer Activity Feature Module for E-commerce Platform

This module defines, calculates, and manages features that monitor customer behavior
and engagement patterns. It provides actionable and measurable features to help detect
early signs of customers losing interest, enabling targeted marketing and retention strategies.

The module focuses strictly on feature definition and calculation without implementing
predictive models or machine learning algorithms.
"""

from datetime import datetime, timedelta
from typing import Dict, List, Optional, Union, Any
from collections import defaultdict
import json


class CustomerActivityFeatures:
    """
    Main class for managing and calculating customer activity features.
    
    This class provides methods to calculate various customer behavior metrics
    including purchase behavior, session engagement, cart behavior, and support interactions.
    """
    
    def __init__(self):
        """Initialize the feature manager with empty data structures."""
        self._purchase_history = defaultdict(list)
        self._session_history = defaultdict(list)
        self._cart_history = defaultdict(list)
        self._support_history = defaultdict(list)
        self._customer_metadata = {}
    
    def add_purchase(self, customer_id: str, order_value: float, 
                    purchase_date: Optional[datetime] = None) -> None:
        """
        Record a purchase for a customer.
        
        Args:
            customer_id: Unique identifier for the customer
            order_value: Monetary value of the order
            purchase_date: Date of purchase (defaults to current time if None)
        """
        if purchase_date is None:
            purchase_date = datetime.now()
        
        if not isinstance(order_value, (int, float)) or order_value < 0:
            return
        
        self._purchase_history[customer_id].append({
            'value': float(order_value),
            'date': purchase_date
        })
    
    def add_session(self, customer_id: str, duration_seconds: float,
                   device_type: Optional[str] = None,
                   session_date: Optional[datetime] = None) -> None:
        """
        Record a session for a customer.
        
        Args:
            customer_id: Unique identifier for the customer
            duration_seconds: Duration of the session in seconds
            device_type: Type of device used (e.g., 'mobile', 'desktop', 'tablet')
            session_date: Date of session (defaults to current time if None)
        """
        if session_date is None:
            session_date = datetime.now()
        
        if not isinstance(duration_seconds, (int, float)) or duration_seconds < 0:
            return
        
        self._session_history[customer_id].append({
            'duration': float(duration_seconds),
            'device': device_type if device_type else 'unknown',
            'date': session_date
        })
    
    def add_cart_event(self, customer_id: str, event_type: str,
                      cart_value: Optional[float] = None,
                      event_date: Optional[datetime] = None) -> None:
        """
        Record a cart event (abandoned or converted).
        
        Args:
            customer_id: Unique identifier for the customer
            event_type: Type of event ('abandoned' or 'converted')
            cart_value: Value of the cart (optional)
            event_date: Date of event (defaults to current time if None)
        """
        if not customer_id:
            return
        
        if event_date is None:
            event_date = datetime.now()
        
        if event_type not in ('abandoned', 'converted'):
            return
        
        if cart_value is not None and (not isinstance(cart_value, (int, float)) or cart_value < 0):
            return
        
        self._cart_history[customer_id].append({
            'type': event_type,
            'value': float(cart_value) if cart_value is not None else None,
            'date': event_date
        })
    
    def add_support_interaction(self, customer_id: str, ticket_id: str,
                               response_time_hours: Optional[float] = None,
                               escalated: bool = False,
                               interaction_date: Optional[datetime] = None) -> None:
        """
        Record a support interaction for a customer.
        
        Args:
            customer_id: Unique identifier for the customer
            ticket_id: Unique identifier for the support ticket
            response_time_hours: Time taken to respond in hours (optional)
            escalated: Whether the ticket was escalated
            interaction_date: Date of interaction (defaults to current time if None)
        """
        if interaction_date is None:
            interaction_date = datetime.now()
        
        if response_time_hours is not None and (not isinstance(response_time_hours, (int, float)) or response_time_hours < 0):
            response_time_hours = None
        
        self._support_history[customer_id].append({
            'ticket_id': ticket_id,
            'response_time': float(response_time_hours) if response_time_hours is not None else None,
            'escalated': bool(escalated),
            'date': interaction_date
        })
    
    def _sanitize_metadata(self, metadata: Any) -> Dict[str, Any]:
        """Sanitize metadata to ensure it is JSON-serializable and safe to store."""

        def sanitize(value: Any) -> Any:
            if isinstance(value, (str, int, float, bool)) or value is None:
                return value
            if isinstance(value, dict):
                return {str(k): sanitize(v) for k, v in value.items()}
            if isinstance(value, list):
                return [sanitize(v) for v in value]
            # Fallback: convert unsupported types to string representation
            return str(value)

        if not isinstance(metadata, dict):
            return {}
        return sanitize(metadata)

    def set_customer_metadata(self, customer_id: str, metadata: Dict[str, Any]) -> None:
        """
        Set metadata for a customer.
        
        Args:
            customer_id: Unique identifier for the customer
            metadata: Dictionary of metadata attributes
        """
        if not customer_id:
            return
        sanitized = self._sanitize_metadata(metadata)
        self._customer_metadata[customer_id] = sanitized
    
    # Purchase Behavior Features
    
    def get_purchase_frequency(self, customer_id: str, 
                               days: int = 30) -> float:
        """
        Calculate purchase frequency (purchases per time period).
        
        Args:
            customer_id: Unique identifier for the customer
            days: Number of days to look back (default: 30)
            
        Returns:
            Purchase frequency as purchases per period, or 0.0 if no purchases
        """
        if not customer_id or days <= 0:
            return 0.0
        
        purchases = self._purchase_history.get(customer_id, [])
        if not purchases:
            return 0.0
        
        cutoff_date = datetime.now() - timedelta(days=days)
        recent_purchases = [p for p in purchases if p['date'] >= cutoff_date]
        
        if not recent_purchases:
            return 0.0
        
        return len(recent_purchases) / (days / 30.0)  # Normalize to per month
    
    def get_average_order_value(self, customer_id: str,
                               days: Optional[int] = None) -> float:
        """
        Calculate average order value for a customer.
        
        Args:
            customer_id: Unique identifier for the customer
            days: Number of days to look back (None for all time)
            
        Returns:
            Average order value, or 0.0 if no purchases
        """
        if not customer_id:
            return 0.0
        
        purchases = self._purchase_history.get(customer_id, [])
        if not purchases:
            return 0.0
        
        if days is not None and days > 0:
            cutoff_date = datetime.now() - timedelta(days=days)
            purchases = [p for p in purchases if p['date'] >= cutoff_date]
        
        if not purchases:
            return 0.0
        
        total_value = sum(p['value'] for p in purchases)
        return total_value / len(purchases)
    
    def get_purchase_recency(self, customer_id: str) -> Optional[int]:
        """
        Calculate days since last purchase (recency).
        
        Args:
            customer_id: Unique identifier for the customer
            
        Returns:
            Days since last purchase, or None if no purchases
        """
        if not customer_id:
            return None
        
        purchases = self._purchase_history.get(customer_id, [])
        if not purchases:
            return None
        
        latest_purchase = max(purchases, key=lambda p: p['date'])
        days_since = (datetime.now() - latest_purchase['date']).days
        return days_since
    
    def get_total_purchase_value(self, customer_id: str,
                                days: Optional[int] = None) -> float:
        """
        Calculate total purchase value for a customer.
        
        Args:
            customer_id: Unique identifier for the customer
            days: Number of days to look back (None for all time)
            
        Returns:
            Total purchase value, or 0.0 if no purchases
        """
        if not customer_id:
            return 0.0
        
        purchases = self._purchase_history.get(customer_id, [])
        if not purchases:
            return 0.0
        
        if days is not None and days > 0:
            cutoff_date = datetime.now() - timedelta(days=days)
            purchases = [p for p in purchases if p['date'] >= cutoff_date]
        
        return sum(p['value'] for p in purchases)
    
    # Session Engagement Features
    
    def get_session_frequency(self, customer_id: str,
                             days: int = 30) -> float:
        """
        Calculate session frequency (sessions per time period).
        
        Args:
            customer_id: Unique identifier for the customer
            days: Number of days to look back (default: 30)
            
        Returns:
            Session frequency as sessions per period, or 0.0 if no sessions
        """
        if not customer_id or days <= 0:
            return 0.0
        
        sessions = self._session_history.get(customer_id, [])
        if not sessions:
            return 0.0
        
        cutoff_date = datetime.now() - timedelta(days=days)
        recent_sessions = [s for s in sessions if s['date'] >= cutoff_date]
        
        if not recent_sessions:
            return 0.0
        
        return len(recent_sessions) / (days / 30.0)  # Normalize to per month
    
    def get_average_session_duration(self, customer_id: str,
                                    days: Optional[int] = None) -> float:
        """
        Calculate average session duration for a customer.
        
        Args:
            customer_id: Unique identifier for the customer
            days: Number of days to look back (None for all time)
            
        Returns:
            Average session duration in seconds, or 0.0 if no sessions
        """
        if not customer_id:
            return 0.0
        
        sessions = self._session_history.get(customer_id, [])
        if not sessions:
            return 0.0
        
        if days is not None and days > 0:
            cutoff_date = datetime.now() - timedelta(days=days)
            sessions = [s for s in sessions if s['date'] >= cutoff_date]
        
        if not sessions:
            return 0.0
        
        total_duration = sum(s['duration'] for s in sessions)
        return total_duration / len(sessions)
    
    def get_device_usage_pattern(self, customer_id: str,
                                days: Optional[int] = None) -> Dict[str, int]:
        """
        Get device usage pattern for a customer.
        
        Args:
            customer_id: Unique identifier for the customer
            days: Number of days to look back (None for all time)
            
        Returns:
            Dictionary mapping device types to session counts
        """
        if not customer_id:
            return {}
        
        sessions = self._session_history.get(customer_id, [])
        if not sessions:
            return {}
        
        if days is not None and days > 0:
            cutoff_date = datetime.now() - timedelta(days=days)
            sessions = [s for s in sessions if s['date'] >= cutoff_date]
        
        device_counts = defaultdict(int)
        for session in sessions:
            device = session.get('device', 'unknown')
            device_counts[device] += 1
        
        return dict(device_counts)
    
    def get_primary_device(self, customer_id: str,
                          days: Optional[int] = None) -> Optional[str]:
        """
        Get the primary device type used by a customer.
        
        Args:
            customer_id: Unique identifier for the customer
            days: Number of days to look back (None for all time)
            
        Returns:
            Primary device type, or None if no sessions
        """
        device_pattern = self.get_device_usage_pattern(customer_id, days)
        if not device_pattern:
            return None
        
        return max(device_pattern.items(), key=lambda x: x[1])[0]
    
    # Cart Behavior Features
    
    def get_abandoned_cart_count(self, customer_id: str,
                                days: Optional[int] = None) -> int:
        """
        Get count of abandoned carts for a customer.
        
        Args:
            customer_id: Unique identifier for the customer
            days: Number of days to look back (None for all time)
            
        Returns:
            Count of abandoned carts
        """
        if not customer_id:
            return 0
        
        cart_events = self._cart_history.get(customer_id, [])
        if not cart_events:
            return 0
        
        if days is not None and days > 0:
            cutoff_date = datetime.now() - timedelta(days=days)
            cart_events = [c for c in cart_events if c['date'] >= cutoff_date]
        
        return sum(1 for c in cart_events if c['type'] == 'abandoned')
    
    def get_cart_conversion_ratio(self, customer_id: str,
                                 days: Optional[int] = None) -> float:
        """
        Calculate cart conversion ratio (converted / total carts).
        
        Args:
            customer_id: Unique identifier for the customer
            days: Number of days to look back (None for all time)
            
        Returns:
            Conversion ratio between 0.0 and 1.0, or 0.0 if no carts
        """
        if not customer_id:
            return 0.0
        
        cart_events = self._cart_history.get(customer_id, [])
        if not cart_events:
            return 0.0
        
        if days is not None and days > 0:
            cutoff_date = datetime.now() - timedelta(days=days)
            cart_events = [c for c in cart_events if c['date'] >= cutoff_date]
        
        if not cart_events:
            return 0.0
        
        converted = sum(1 for c in cart_events if c['type'] == 'converted')
        total = len(cart_events)
        
        return converted / total if total > 0 else 0.0
    
    def get_abandoned_cart_value(self, customer_id: str,
                                days: Optional[int] = None) -> float:
        """
        Calculate total value of abandoned carts.
        
        Args:
            customer_id: Unique identifier for the customer
            days: Number of days to look back (None for all time)
            
        Returns:
            Total value of abandoned carts, or 0.0 if none
        """
        if not customer_id:
            return 0.0
        
        cart_events = self._cart_history.get(customer_id, [])
        if not cart_events:
            return 0.0
        
        if days is not None and days > 0:
            cutoff_date = datetime.now() - timedelta(days=days)
            cart_events = [c for c in cart_events if c['date'] >= cutoff_date]
        
        abandoned = [c for c in cart_events if c['type'] == 'abandoned' and c['value'] is not None]
        return sum(c['value'] for c in abandoned)
    
    # Support Interaction Features
    
    def get_support_ticket_count(self, customer_id: str,
                                days: Optional[int] = None) -> int:
        """
        Get count of support tickets for a customer.
        
        Args:
            customer_id: Unique identifier for the customer
            days: Number of days to look back (None for all time)
            
        Returns:
            Count of support tickets
        """
        if not customer_id:
            return 0
        
        support_interactions = self._support_history.get(customer_id, [])
        if not support_interactions:
            return 0
        
        if days is not None and days > 0:
            cutoff_date = datetime.now() - timedelta(days=days)
            support_interactions = [s for s in support_interactions if s['date'] >= cutoff_date]
        
        return len(support_interactions)
    
    def get_average_response_time(self, customer_id: str,
                                 days: Optional[int] = None) -> Optional[float]:
        """
        Calculate average response time for support tickets.
        
        Args:
            customer_id: Unique identifier for the customer
            days: Number of days to look back (None for all time)
            
        Returns:
            Average response time in hours, or None if no tickets with response times
        """
        if not customer_id:
            return None
        
        support_interactions = self._support_history.get(customer_id, [])
        if not support_interactions:
            return None
        
        if days is not None and days > 0:
            cutoff_date = datetime.now() - timedelta(days=days)
            support_interactions = [s for s in support_interactions if s['date'] >= cutoff_date]
        
        response_times = [s['response_time'] for s in support_interactions 
                         if s['response_time'] is not None]
        
        if not response_times:
            return None
        
        return sum(response_times) / len(response_times)
    
    def get_escalation_count(self, customer_id: str,
                            days: Optional[int] = None) -> int:
        """
        Get count of escalated support tickets.
        
        Args:
            customer_id: Unique identifier for the customer
            days: Number of days to look back (None for all time)
            
        Returns:
            Count of escalated tickets
        """
        if not customer_id:
            return 0
        
        support_interactions = self._support_history.get(customer_id, [])
        if not support_interactions:
            return 0
        
        if days is not None and days > 0:
            cutoff_date = datetime.now() - timedelta(days=days)
            support_interactions = [s for s in support_interactions if s['date'] >= cutoff_date]
        
        return sum(1 for s in support_interactions if s['escalated'])
    
    def get_escalation_ratio(self, customer_id: str,
                            days: Optional[int] = None) -> float:
        """
        Calculate escalation ratio (escalated tickets / total tickets).
        
        Args:
            customer_id: Unique identifier for the customer
            days: Number of days to look back (None for all time)
            
        Returns:
            Escalation ratio between 0.0 and 1.0, or 0.0 if no tickets
        """
        if not customer_id:
            return 0.0
        
        support_interactions = self._support_history.get(customer_id, [])
        if not support_interactions:
            return 0.0
        
        if days is not None and days > 0:
            cutoff_date = datetime.now() - timedelta(days=days)
            support_interactions = [s for s in support_interactions if s['date'] >= cutoff_date]
        
        if not support_interactions:
            return 0.0
        
        escalated = sum(1 for s in support_interactions if s['escalated'])
        return escalated / len(support_interactions)
    
    # Trade-off Indicators (Short-term vs Long-term)
    
    def get_activity_retention_tradeoff(self, customer_id: str) -> Dict[str, Union[str, bool, float]]:
        """
        Calculate indicators for trade-offs between short-term activity and long-term retention.
        
        This provides descriptive flags and indicators without predictive formulas.
        
        Args:
            customer_id: Unique identifier for the customer
            
        Returns:
            Dictionary with trade-off indicators
        """
        if not customer_id:
            return {
                'high_short_term_activity': False,
                'declining_engagement': False,
                'support_risk': False,
                'cart_abandonment_risk': False,
                'retention_concern': False
            }
        
        # Short-term activity indicators
        recent_purchase_freq = self.get_purchase_frequency(customer_id, days=30)
        recent_session_freq = self.get_session_frequency(customer_id, days=30)
        
        # Long-term activity indicators
        long_term_purchase_freq = self.get_purchase_frequency(customer_id, days=90)
        long_term_session_freq = self.get_session_frequency(customer_id, days=90)
        
        # Engagement trends
        purchase_recency = self.get_purchase_recency(customer_id)
        cart_conversion = self.get_cart_conversion_ratio(customer_id, days=30)
        abandoned_carts = self.get_abandoned_cart_count(customer_id, days=30)
        escalation_ratio = self.get_escalation_ratio(customer_id, days=30)
        
        # Calculate indicators
        high_short_term = recent_purchase_freq > 0 and recent_session_freq > 0
        
        declining_engagement = False
        if long_term_purchase_freq > 0 and recent_purchase_freq > 0:
            decline_ratio = recent_purchase_freq / long_term_purchase_freq if long_term_purchase_freq > 0 else 0
            declining_engagement = decline_ratio < 0.7  # 30% decline threshold
        
        support_risk = escalation_ratio > 0.5 or self.get_support_ticket_count(customer_id, days=30) > 3
        
        cart_abandonment_risk = cart_conversion < 0.3 and abandoned_carts > 2
        
        retention_concern = (
            (purchase_recency is not None and purchase_recency > 60) or
            declining_engagement or
            support_risk or
            cart_abandonment_risk
        )
        
        return {
            'high_short_term_activity': high_short_term,
            'declining_engagement': declining_engagement,
            'support_risk': support_risk,
            'cart_abandonment_risk': cart_abandonment_risk,
            'retention_concern': retention_concern,
            'activity_trend': 'declining' if declining_engagement else 'stable' if high_short_term else 'inactive'
        }
    
    # Feature Summary and Retrieval
    
    def get_all_features(self, customer_id: str,
                       days: Optional[int] = None) -> Dict[str, Any]:
        """
        Get all calculated features for a customer.
        
        Args:
            customer_id: Unique identifier for the customer
            days: Number of days to look back for time-based features (None for all time)
            
        Returns:
            Dictionary containing all feature values
        """
        if not customer_id:
            return {}
        
        features = {
            # Purchase behavior
            'purchase_frequency': self.get_purchase_frequency(customer_id, days or 30),
            'average_order_value': self.get_average_order_value(customer_id, days),
            'purchase_recency_days': self.get_purchase_recency(customer_id),
            'total_purchase_value': self.get_total_purchase_value(customer_id, days),
            
            # Session engagement
            'session_frequency': self.get_session_frequency(customer_id, days or 30),
            'average_session_duration': self.get_average_session_duration(customer_id, days),
            'device_usage_pattern': self.get_device_usage_pattern(customer_id, days),
            'primary_device': self.get_primary_device(customer_id, days),
            
            # Cart behavior
            'abandoned_cart_count': self.get_abandoned_cart_count(customer_id, days),
            'cart_conversion_ratio': self.get_cart_conversion_ratio(customer_id, days),
            'abandoned_cart_value': self.get_abandoned_cart_value(customer_id, days),
            
            # Support interactions
            'support_ticket_count': self.get_support_ticket_count(customer_id, days),
            'average_response_time_hours': self.get_average_response_time(customer_id, days),
            'escalation_count': self.get_escalation_count(customer_id, days),
            'escalation_ratio': self.get_escalation_ratio(customer_id, days),
            
            # Trade-off indicators
            'activity_retention_tradeoff': self.get_activity_retention_tradeoff(customer_id)
        }
        
        # Add metadata if available
        if customer_id in self._customer_metadata:
            features['metadata'] = self._customer_metadata[customer_id].copy()
        
        return features
    
    def get_feature_summary(self, customer_id: str) -> Dict[str, Any]:
        """
        Get a summary of key features for a customer.
        
        Args:
            customer_id: Unique identifier for the customer
            
        Returns:
            Dictionary with summary metrics
        """
        if not customer_id:
            return {}
        
        all_features = self.get_all_features(customer_id)
        tradeoff = all_features.get('activity_retention_tradeoff', {})
        
        summary = {
            'customer_id': customer_id,
            'purchase_metrics': {
                'frequency_per_month': all_features.get('purchase_frequency', 0.0),
                'average_order_value': all_features.get('average_order_value', 0.0),
                'days_since_last_purchase': all_features.get('purchase_recency_days'),
                'total_value': all_features.get('total_purchase_value', 0.0)
            },
            'engagement_metrics': {
                'session_frequency_per_month': all_features.get('session_frequency', 0.0),
                'average_duration_seconds': all_features.get('average_session_duration', 0.0),
                'primary_device': all_features.get('primary_device')
            },
            'cart_metrics': {
                'conversion_ratio': all_features.get('cart_conversion_ratio', 0.0),
                'abandoned_count': all_features.get('abandoned_cart_count', 0),
                'abandoned_value': all_features.get('abandoned_cart_value', 0.0)
            },
            'support_metrics': {
                'ticket_count': all_features.get('support_ticket_count', 0),
                'average_response_hours': all_features.get('average_response_time_hours'),
                'escalation_ratio': all_features.get('escalation_ratio', 0.0)
            },
            'retention_indicators': {
                'retention_concern': tradeoff.get('retention_concern', False),
                'activity_trend': tradeoff.get('activity_trend', 'inactive'),
                'declining_engagement': tradeoff.get('declining_engagement', False)
            }
        }
        
        return summary

    def get_cohort_features(self, customer_ids: List[str],
                            days: Optional[int] = None) -> Dict[str, Dict[str, Any]]:
        """
        Get features for a cohort of customers.
        
        Args:
            customer_ids: List of customer identifiers
            days: Optional days window for time-based features
        
        Returns:
            Mapping from customer_id to that customer's feature dictionary
        """
        if not customer_ids:
            return {}

        cohort: Dict[str, Dict[str, Any]] = {}
        for cid in customer_ids:
            if not cid:
                continue
            cohort[cid] = self.get_all_features(cid, days)
        return cohort

    def get_cohort_summary(self, customer_ids: List[str],
                           days: Optional[int] = None) -> Dict[str, Any]:
        """
        Get aggregate summary metrics for a cohort of customers.
        
        Aggregates numeric (non-boolean) feature values using a simple mean.
        """
        cohort = self.get_cohort_features(customer_ids, days)
        if not cohort:
            return {"size": 0, "aggregates": {}}

        size = len(cohort)
        numeric_keys = set()
        for features in cohort.values():
            for key, value in features.items():
                if isinstance(value, (int, float)) and not isinstance(value, bool):
                    numeric_keys.add(key)

        aggregates: Dict[str, float] = {}
        for key in numeric_keys:
            values: List[float] = []
            for features in cohort.values():
                value = features.get(key)
                if isinstance(value, (int, float)) and not isinstance(value, bool):
                    values.append(float(value))
            if values:
                aggregates[key] = sum(values) / len(values)

        return {"size": size, "aggregates": aggregates}


# Convenience functions for direct feature calculation

def calculate_purchase_features(purchases: List[Dict[str, Any]],
                               days: Optional[int] = None) -> Dict[str, Any]:
    """
    Calculate purchase-related features from a list of purchase records.
    
    Args:
        purchases: List of purchase dictionaries with 'value' and 'date' keys
        days: Number of days to look back (None for all time)
        
    Returns:
        Dictionary with purchase features
    """
    manager = CustomerActivityFeatures()
    
    for purchase in purchases:
        if not isinstance(purchase, dict):
            continue
        
        value = purchase.get('value')
        date = purchase.get('date')
        
        if value is None:
            continue
        
        if isinstance(date, str):
            try:
                date = datetime.fromisoformat(date.replace('Z', '+00:00'))
            except (ValueError, AttributeError):
                date = None
        
        manager.add_purchase('temp_customer', value, date)
    
    return {
        'frequency': manager.get_purchase_frequency('temp_customer', days or 30),
        'average_order_value': manager.get_average_order_value('temp_customer', days),
        'recency_days': manager.get_purchase_recency('temp_customer'),
        'total_value': manager.get_total_purchase_value('temp_customer', days)
    }


def calculate_session_features(sessions: List[Dict[str, Any]],
                              days: Optional[int] = None) -> Dict[str, Any]:
    """
    Calculate session-related features from a list of session records.
    
    Args:
        sessions: List of session dictionaries with 'duration' and optionally 'device' and 'date' keys
        days: Number of days to look back (None for all time)
        
    Returns:
        Dictionary with session features
    """
    manager = CustomerActivityFeatures()
    
    for session in sessions:
        if not isinstance(session, dict):
            continue
        
        duration = session.get('duration')
        if duration is None:
            continue
        
        device = session.get('device')
        date = session.get('date')
        
        if isinstance(date, str):
            try:
                date = datetime.fromisoformat(date.replace('Z', '+00:00'))
            except (ValueError, AttributeError):
                # Skip sessions with invalid date strings
                continue
        
        manager.add_session('temp_customer', duration, device, date)
    
    return {
        'frequency': manager.get_session_frequency('temp_customer', days or 30),
        'average_duration': manager.get_average_session_duration('temp_customer', days),
        'device_pattern': manager.get_device_usage_pattern('temp_customer', days),
        'primary_device': manager.get_primary_device('temp_customer', days)
    }

