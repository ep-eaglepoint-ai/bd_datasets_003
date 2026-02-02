const { AppError } = require("./errors");

/**
 * Split an integer `totalCents` into `count` integer shares, distributing remainder
 * by giving +1 cent to the first `remainder` participants.
 */
function splitCentsEvenly(totalCents, count) {
  if (!Number.isInteger(totalCents) || totalCents <= 0) {
    throw new AppError("INVALID_AMOUNT", "totalCents must be a positive integer", 400);
  }
  if (!Number.isInteger(count) || count <= 0) {
    throw new AppError("INVALID_PARTICIPANTS", "participantIds must be a non-empty array", 400);
  }

  const base = Math.floor(totalCents / count);
  const remainder = totalCents - base * count;

  const shares = Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
  const sum = shares.reduce((a, b) => a + b, 0);
  if (sum !== totalCents) {
    throw new AppError("INTERNAL_MATH_ERROR", "Split did not sum to totalCents", 500);
  }
  return shares;
}

module.exports = { splitCentsEvenly };

