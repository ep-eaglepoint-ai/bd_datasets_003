# Trajectory: Backdated Payroll Pro‑Rata Adjuster

# Backdated Payroll Pro-Rata Adjuster (Month-Accurate)

## Problem

Naively prorating backpay as `days × monthly/30` is incorrect because:

- Months have different lengths (28–31 days)
- Leap years affect February
- Repeated rounding introduces bias
- Floating-point math causes cent-level errors

Payroll math must be calendar-accurate, deterministic, and fair.

## Solution Overview

This implementation computes backpay using:

- **Actual calendar days per month**
- **Integer arithmetic only** (no floats)
- **Banker’s rounding** (round-half-to-even) to reduce bias
- **Per-day accumulation across the date range**

## Key Rules

1. **Daily rate depends on the month**
   - `daily_rate = monthly_salary / days_in_that_month`

2. **High-precision integers**
   - Convert cents to micros (`cents × 1_000_000`) before division

3. **Fair rounding**
   - Use banker’s rounding for all divisions

4. **Exact date handling**
   - Iterate each day in `[backdate, effective_date)`
   - Use that day’s month length

## Validation

- Salaries must be non-negative
- `backdate <= effective_date`
- Same-day windows return `0`

## Why This Design

- Fixed 30-day months are wrong
- Day-by-day logic is simplest and safest
- Banker’s rounding avoids long-term bias
- Integer math prevents floating-point cent errors

This approach matches real-world payroll expectations while staying deterministic and easy to reason about.

## 📚 Resources I’d recommend

1. **Python `divmod()` for exact quotient+remainder arithmetic**
	- Python docs: https://docs.python.org/3/library/functions.html#divmod

2. **Financial calculations and floating point pitfalls**
	- Python docs (tutorial note on floats): https://docs.python.org/3/tutorial/floatingpoint.html


