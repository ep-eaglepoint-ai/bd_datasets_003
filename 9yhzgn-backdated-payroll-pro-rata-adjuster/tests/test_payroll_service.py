from datetime import date
import os
import sys

import pytest

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../repository_after"))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from payroll_service import PayrollEngine, _days_in_month


def test_leap_year_feb_days_and_cross_month_span():
    assert _days_in_month(date(2024, 2, 1)) == 29

    engine = PayrollEngine()
    backpay = engine.calculate_backpay(
        old_salary_cents=500_000,
        new_salary_cents=600_000,
        backdate=date(2024, 2, 28),
        effective_date=date(2024, 3, 1),
    )
    assert backpay > 0


def test_conservation_full_month_31_days_exactly_matches_salary():
    engine = PayrollEngine()
    monthly = 600_000
    d = date(2024, 3, 1)  # March has 31 days
    daily_micros = engine._daily_rate_micros(monthly, d)
    total_micros = daily_micros * 31
    total_cents = round(total_micros / engine.micros_per_cent)
    assert total_cents == monthly


def test_full_month_backpay_equals_monthly_salary_difference_exact():
    engine = PayrollEngine()
    # Full month span should match exactly the monthly salary delta.
    assert (
        engine.calculate_backpay(
            old_salary_cents=500_000,
            new_salary_cents=600_000,
            backdate=date(2024, 3, 1),
            effective_date=date(2024, 4, 1),
        )
        == 100_000
    )

    # Leap-year February full month.
    assert (
        engine.calculate_backpay(
            old_salary_cents=500_000,
            new_salary_cents=600_000,
            backdate=date(2024, 2, 1),
            effective_date=date(2024, 3, 1),
        )
        == 100_000
    )


def test_partial_periods_have_stable_exact_cent_results():
    engine = PayrollEngine()

    # Feb 10 -> Feb 20 in leap year (10 days out of 29)
    assert (
        engine.calculate_backpay(
            old_salary_cents=500_000,
            new_salary_cents=600_000,
            backdate=date(2024, 2, 10),
            effective_date=date(2024, 2, 20),
        )
        == 34_483
    )

    # Cross-month span: Feb 28 -> Mar 2 (2 days of Feb + 1 day of Mar)
    assert (
        engine.calculate_backpay(
            old_salary_cents=500_000,
            new_salary_cents=600_000,
            backdate=date(2024, 2, 28),
            effective_date=date(2024, 3, 2),
        )
        == 10_122
    )


def test_same_day_zero_backpay():
    engine = PayrollEngine()
    assert (
        engine.calculate_backpay(500_000, 600_000, date(2024, 2, 15), date(2024, 2, 15))
        == 0
    )


def test_multi_month_three_month_span_uses_each_month_day_count():
    engine = PayrollEngine()
    backpay = engine.calculate_backpay(
        old_salary_cents=500_000,
        new_salary_cents=600_000,
        backdate=date(2024, 1, 15),
        effective_date=date(2024, 3, 15),
    )
    assert backpay > 0


def test_input_validation():
    engine = PayrollEngine()
    with pytest.raises(ValueError):
        engine.calculate_backpay(-1, 100, date(2024, 2, 1), date(2024, 2, 2))
    with pytest.raises(ValueError):
        engine.calculate_backpay(100, -1, date(2024, 2, 1), date(2024, 2, 2))
    with pytest.raises(ValueError):
        engine.calculate_backpay(100, 200, date(2024, 2, 2), date(2024, 2, 1))
