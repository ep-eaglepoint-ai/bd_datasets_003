# Broken implementation: Doesn't properly handle invalid input
from decimal import Decimal, ROUND_HALF_UP, getcontext
from datetime import datetime, date
from typing import List, Dict, Optional

getcontext().prec = 28

class FiscalPrecisionEngine:
    """
    Broken implementation: Missing validation for invalid date ranges.
    This should be caught by negative tests.
    """

    def __init__(self, tax_brackets: List[Dict[str, Decimal]], annual_base_rate: Decimal):
        self.tax_brackets = sorted(tax_brackets, key=lambda x: x['limit'])
        self.annual_base_rate = annual_base_rate

    def calculate_tiered_tax(self, total_income: Decimal) -> Decimal:
        if total_income <= 0:
            return Decimal('0.00')

        tax_owed = Decimal('0.00')
        previous_limit = Decimal('0.00')

        for bracket in self.tax_brackets:
            limit = bracket['limit']
            rate = bracket['rate']

            if total_income > limit:
                taxable_in_bracket = limit - previous_limit
                tax_owed += taxable_in_bracket * rate
                previous_limit = limit
            else:
                taxable_in_bracket = total_income - previous_limit
                tax_owed += taxable_in_bracket * rate
                previous_limit = total_income
                break

        return tax_owed.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    def compute_accrued_interest(self, principal: Decimal, start_date: date, end_date: date) -> Decimal:
        """
        BROKEN: Doesn't check if end_date <= start_date properly.
        Returns negative interest instead of 0.
        """
        # BUG: Missing proper validation
        delta = end_date - start_date
        days = Decimal(delta.days)  # This can be negative!
        
        daily_rate = self.annual_base_rate / Decimal('365')
        interest = principal * daily_rate * days  # Can return negative!
        
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

