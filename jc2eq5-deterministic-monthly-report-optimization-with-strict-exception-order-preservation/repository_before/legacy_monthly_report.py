from typing import List, Dict, Any
from datetime import datetime

def build_monthly_report(
    transactions: List[Dict[str, Any]],
    expected_months: List[str],
    base_currency: str = "USD"
) -> Dict[str, Any]:
    """
    Returns:
      {
        "base_currency": str,
        "months": [
          {
            "month": "YYYY-MM",
            "total_base": float,            # rounded to 2 decimals
            "by_category": {cat: float},    # rounded to 2 decimals
            "top_merchants": [str, ...]     # top 3 merchants by base amount (descending), tie => name asc
          },
          ...
        ]
      }

    Rules:
    - The months section must include ALL months in expected_months, in the SAME order.
      Months with no matching transactions must still appear with:
        total_base = 0.0
        by_category = {}
        top_merchants = []
    - Each transaction "amount" is in transaction["currency"] and must be converted to base_currency using FX table.
    - Invalid transaction shapes should raise the same exceptions as current behavior.
    """

    fx = {
        ("USD", "USD"): 1.0,
        ("EUR", "USD"): 1.08,
        ("GBP", "USD"): 1.27,
        ("USD", "EUR"): 0.93,
        ("GBP", "EUR"): 1.17,
        ("EUR", "EUR"): 1.0,
        ("USD", "GBP"): 0.79,
        ("EUR", "GBP"): 0.86,
        ("GBP", "GBP"): 1.0,
    }

    report_months = []

    # Legacy implementation (inefficient by design)
    for m in expected_months:
        total_base = 0.0
        by_category: Dict[str, float] = {}
        merchant_totals: Dict[str, float] = {}

        for t in transactions:
            ts = datetime.strptime(t["timestamp"].strip(), "%Y-%m-%d %H:%M:%S")
            month_key = ts.strftime("%Y-%m")
            if month_key != m:
                continue

            cat = (t.get("category") or "uncategorized").strip().lower()
            merchant = (t.get("merchant") or "unknown").strip().lower()

            amt = float(t["amount"])
            cur = t["currency"].strip().upper()
            base = base_currency.strip().upper()

            rate = fx[(cur, base)]
            base_amt = amt * rate

            total_base += base_amt

            if cat not in by_category:
                by_category[cat] = 0.0
            by_category[cat] += base_amt

            if merchant not in merchant_totals:
                merchant_totals[merchant] = 0.0
            merchant_totals[merchant] += base_amt

        ranked = sorted(merchant_totals.items(), key=lambda kv: (-kv[1], kv[0]))
        top_merchants = [name for name, _ in ranked[:3]]

        report_months.append({
            "month": m,
            "total_base": round(total_base, 2),
            "by_category": {k: round(v, 2) for k, v in by_category.items()},
            "top_merchants": top_merchants,
        })

    return {
        "base_currency": base_currency.strip().upper(),
        "months": report_months,
    }
