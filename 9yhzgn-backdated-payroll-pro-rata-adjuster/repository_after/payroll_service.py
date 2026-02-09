from __future__ import annotations

from dataclasses import dataclass
from datetime import date


def _first_day_of_next_month(d: date) -> date:
    """Return the first day of the month following the one containing d."""
    if d.month == 12:
        return date(d.year + 1, 1, 1)
    return date(d.year, d.month + 1, 1)


def _bankers_round_div(numerator: int, denominator: int) -> int:
    """Divide integers using round-half-to-even."""

    q, r = divmod(numerator, denominator)
    if r == 0:
        return q

    twice_r = 2 * r
    if twice_r < denominator:
        return q
    if twice_r > denominator:
        return q + 1

    return q if (q % 2 == 0) else (q + 1)


def _days_in_month(d: date) -> int:
    """Return number of days in the calendar month containing d."""
    next_month = _first_day_of_next_month(d)
    return (next_month - date(d.year, d.month, 1)).days


@dataclass(frozen=True)
class PayrollEngine:
    """Calculates backdated pro-rata salary adjustments using integer arithmetic."""

    micros_per_cent: int = 1_000_000

    def _daily_rate_micros(self, monthly_salary_cents: int, any_day_in_month: date) -> int:
        """Compute the per-day rate in micros for the month containing any_day_in_month."""
        dim = _days_in_month(any_day_in_month)
        monthly_micros = monthly_salary_cents * self.micros_per_cent
        return _bankers_round_div(monthly_micros, dim)

    def calculate_backpay(
        self,
        old_salary_cents: int,
        new_salary_cents: int,
        backdate: date,
        effective_date: date,
    ) -> int:
        """Return backpay owed in cents for days in [backdate, effective_date)."""

        if old_salary_cents < 0 or new_salary_cents < 0:
            raise ValueError("Salaries must be non-negative")
        if backdate > effective_date:
            raise ValueError("backdate must be on or before effective_date")
        if backdate == effective_date:
            return 0

        # Cumulative, period-based pro-rata
        total_delta_micros = 0
        delta_monthly_micros = (new_salary_cents - old_salary_cents) * self.micros_per_cent

        cursor = backdate
        while cursor < effective_date:
            month_end = _first_day_of_next_month(cursor)
            segment_end = month_end if month_end < effective_date else effective_date

            days_covered = (segment_end - cursor).days
            dim = _days_in_month(cursor)

            # Prorated delta for this month segment
            segment_micros = _bankers_round_div(delta_monthly_micros * days_covered, dim)
            total_delta_micros += segment_micros

            cursor = segment_end

        return _bankers_round_div(total_delta_micros, self.micros_per_cent)
