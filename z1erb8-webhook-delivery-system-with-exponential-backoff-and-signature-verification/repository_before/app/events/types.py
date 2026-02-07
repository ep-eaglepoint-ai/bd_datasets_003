from enum import Enum

class EventType(str, Enum):
    USER_SIGNUP = "user.signup"
    USER_UPDATED = "user.updated"
    ORDER_PLACED = "order.placed"
    ORDER_SHIPPED = "order.shipped"
    ORDER_DELIVERED = "order.delivered"
    PAYMENT_RECEIVED = "payment.received"
    PAYMENT_FAILED = "payment.failed"
    SUBSCRIPTION_CREATED = "subscription.created"
    SUBSCRIPTION_CANCELLED = "subscription.cancelled"
