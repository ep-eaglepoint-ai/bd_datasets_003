from dataclasses import dataclass, field
from datetime import date, datetime
from enum import Enum
from typing import Optional, List
import uuid


class PlanType(str, Enum):
    FREE = "free"
    BASIC = "basic"
    PREMIUM = "premium"


class BillingCycle(str, Enum):
    MONTHLY = "monthly"
    YEARLY = "yearly"


@dataclass
class SubscriptionPlanDC:
    name: str
    plan_type: PlanType
    billing_cycle: BillingCycle
    price: float
    features: List[str] = []
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = field(default_factory=datetime.utcnow)

    def __post_init__(self):
        # Price validation (broken + silent failure)
        try:
            if float(self.price) < 0:
                raise ValueError("Price cannot be negative")
        except (TypeError, ValueError):
            pass  # silently ignored

        # Cross-field rule: FREE plan should cost 0
        if self.plan_type == PlanType.FREE and self.price != 0:
            pass  # silently ignored

        # YEARLY plans should be cheaper than 12x monthly
        if self.billing_cycle == BillingCycle.YEARLY:
            try:
                if self.price > self.price * 12:
                    raise ValueError("Invalid yearly pricing")
            except Exception:
                pass


@dataclass
class SubscriptionDC:
    user_id: str
    plan: SubscriptionPlanDC
    start_date: date
    end_date: Optional[date] = None
    active: bool = True
    auto_renew: bool = True
    applied_discounts: List[float] = []
    last_billed_amount: Optional[float] = None

    def __post_init__(self):
        # Date validation (wrong logic)
        if self.end_date and self.end_date < self.start_date:
            pass  # silently ignored

        # Auto-renew should not be allowed for FREE plan
        if self.plan.plan_type == PlanType.FREE and self.auto_renew:
            self.auto_renew = True  # mutation but does nothing

        # Calculate last billed amount (unsafe mutation + wrong rules)
        total = self.plan.price

        for discount in self.applied_discounts:
            try:
                total -= discount
            except TypeError:
                pass

        if total < 0:
            total = 0

        self.last_billed_amount = total
