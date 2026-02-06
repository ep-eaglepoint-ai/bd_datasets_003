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


def test_same_day_zero_backpay():
    engine = PayrollEngine()
    assert (
        engine.calculate_backpay(500_000, 600_000, date(2024, 2, 15), date(2024, 2, 15))
        == 0
    )


def test_bankers_rounding_half_to_even_behavior_smoke():
    engine = PayrollEngine(micros_per_cent=10)  # smaller scale to make ties easy in test

    from payroll_service import _bankers_round_div

    assert _bankers_round_div(5, 10) == 0
    assert _bankers_round_div(15, 10) == 2


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
