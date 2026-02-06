import { WEBHOOK_BASE_DELAY_MS, WEBHOOK_JITTER_RATIO } from "../constants";

export function computeExponentialBackoffWithJitterMs(
  attemptsMade: number,
  baseDelayMs: number = WEBHOOK_BASE_DELAY_MS,
  jitterRatio: number = WEBHOOK_JITTER_RATIO,
  rand: () => number = Math.random
): number {
  const exponentialDelay =
    baseDelayMs * Math.pow(2, Math.max(0, attemptsMade - 1));
  const jitterMultiplier = 1 + rand() * jitterRatio;
  return Math.round(exponentialDelay * jitterMultiplier);
}
