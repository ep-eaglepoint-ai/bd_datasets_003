import { Card } from "./types";
import { AppError, ErrorCodes } from "./utils/AppError";

function luhnCheck(number: string): boolean {
  let sum = 0;
  let isEven = false;

  for (let i = number.length - 1; i >= 0; i--) {
    let digit = parseInt(number[i], 10);

    if (isEven) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
    isEven = !isEven;
  }

  return sum % 10 === 0;
}

export async function validateCard(card: Card): Promise<boolean> {
  // Simulate async operation as per legacy code structure (was setTimeout 0)
  //   await new Promise(resolve => setTimeout(resolve, 0));
  // Actually, strict async/await doesn't require delay, but if we want to mimic the "next tick" nature we could.
  // However, standard refactoring usually removes unnecessary delays unless they are for IO simulation.
  // The prompt "tests prove identical behavior" suggests if I make it sync but wrap in async, it's fine.

  if (!card || !card.number || !card.expiry || !card.cvv) {
    throw new AppError("Missing card fields", ErrorCodes.INVALID_CARD);
  }

  const number = card.number.replace(/\s/g, "");

  if (!/^\d{13,19}$/.test(number)) {
    return false;
  }

  if (!luhnCheck(number)) {
    return false;
  }

  const parts = card.expiry.split("/");
  if (parts.length !== 2) return false;

  const month = parseInt(parts[0], 10);
  let year = parseInt(parts[1], 10);

  if (isNaN(month) || isNaN(year)) return false;

  if (year < 100) {
    year += 2000;
  }

  const now = new Date();
  // Legacy code: new Date(year, month, 0) creates the last day of the month.
  // Note: JS months are 0-indexed in Date constructor, but `month` parsed from 'MM/YY' is 1-based (likely).
  // new Date(2025, 12, 0) -> Jan 0th 2026? No, Date(year, monthIndex, day).
  // If input is '12/25', month=12.
  // Legacy code: `new Date(year, month, 0)`.
  // If month is 12. new Date(2025, 12, 0).
  // Month 12 is Jan of next year. Day 0 is last day of prev month (Dec).
  // So it correctly gets last day of 12/2025.
  // If month is 1. new Date(2025, 1, 0).
  // Month 1 is Feb. Day 0 is Jan 31st.
  // So checks against end of the month. Correct.

  const expiry = new Date(year, month, 0);

  if (expiry < now) {
    return false;
  }

  if (!/^\d{3,4}$/.test(card.cvv)) {
    return false;
  }

  return true;
}
