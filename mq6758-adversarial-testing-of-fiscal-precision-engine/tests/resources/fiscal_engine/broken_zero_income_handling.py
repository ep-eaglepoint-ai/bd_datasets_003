# Broken implementation: Potential zero division error
from decimal import Decimal, ROUND_HALF_UP, getcontext
from datetime import datetime, date
from typing import List, Dict, Optional

getcontext().prec = 28

class FiscalPrecisionEngine:
    """
    Broken implementation: May cause zero division or incorrect handling of edge cases.
    This should be caught by edge case tests.
    """

    def __init__(self, tax_brackets: List[Dict[str, Decimal]], annual_base_rate: Decimal):
        self.tax_brackets = sorted(tax_brackets, key=lambda x: x['limit'])
        self.annual_base_rate = annual_base_rate

    def calculate_tiered_tax(self, total_income: Decimal) -> Decimal:
        # BUG: Doesn't handle zero income properly - may divide by zero in calculations
        if total_income < 0:  # BUG: Should be <= 0
            return Decimal('0.00')

        tax_owed = Decimal('0.00')
        previous_limit = Decimal('0.00')

        for bracket in self.tax_brackets:
            limit = bracket['limit']
            rate = bracket['rate']

            # BUG: May cause issues when total_income is exactly 0
            if total_income > limit:
                taxable_in_bracket = limit - previous_limit
                # Potential division by zero if previous_limit equals limit
                tax_owed += taxable_in_bracket * rate
                previous_limit = limit
            else:
                taxable_in_bracket = total_income - previous_limit
                tax_owed += taxable_in_bracket * rate
                previous_limit = total_income
                break

        return tax_owed.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    def compute_accrued_interest(self, principal: Decimal, start_date: date, end_date: date) -> Decimal:
        if end_date <= start_date:
            return Decimal('0.00')
        
        delta = end_date - start_date
        days = Decimal(delta.days)
        
        # BUG: No check if days is 0, though it's handled above
        daily_rate = self.annual_base_rate / Decimal('365')
        interest = principal * daily_rate * days
        
        return interest.quantize(Decimal('0.00000001'), rounding=ROUND_HALF_UP)

    def process_batch(self, transactions: List[Dict]) -> Dict[str, Decimal]:
        total_processed = Decimal('0.00')
        for tx in transactions:
            amount = Decimal(str(tx['amount']))
            total_processed += amount
        
        total_tax = self.calculate_tiered_tax(total_processed)
        return {
            "total_volume": total_processed,
            "calculated_tax": total_tax
        }

