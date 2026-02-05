from decimal import Decimal, ROUND_HALF_UP
# Decimal: Used for high-precision financial arithmetic to avoid float errors.
# ROUND_HALF_UP: Standard rounding strategy for financial transactions.

class DiscountCalculator:
    """
    Legacy calculator for processing cart discounts.
    Known Issues: Incorrect stacking, floating point errors, no bounds checking.
    """

    def __init__(self, membership_tier: str = 'BRONZE'):
        self.tier = membership_tier.upper()
        # Tiers: BRONZE (0%), SILVER (10%), GOLD (20%)
        self.tier_map = {
            'BRONZE': Decimal('0.00'),
            'SILVER': Decimal('0.10'),
            'GOLD': Decimal('0.20')
        }

    def calculate_total(self, subtotal: float, promo_code: str = None, promo_value: float = 0.0, is_percent: bool = True) -> float:
        """
        Calculates the final total after applying tier discounts and one promo code.
        """
        # Logic Error 1: Using float instead of Decimal for initial values
        total = subtotal

        # Apply Tier Discount
        discount_rate = self.tier_map.get(self.tier, Decimal('0.00'))
        total -= (total * float(discount_rate))

        # Apply Promo Code
        if promo_code:
            if is_percent:
                # Logic Error 2: Potential for 'stacking' errors
                total -= (total * promo_value)
            else:
                total -= promo_value

        # Logic Error 3: No check for negative totals
        # Logic Error 4: No rounding to 2 decimal places
        return total

# filename: tests/test_discount_calculator.py
import pytest
from billing.discount_calculator import DiscountCalculator

def test_basic_gold_tier_discount():
    """
    Verifies that a GOLD tier user gets 20% off with no promo code.
    """
    calc = DiscountCalculator('GOLD')
    # 100.00 - 20% = 80.00
    assert calc.calculate_total(100.00) == 80.00
