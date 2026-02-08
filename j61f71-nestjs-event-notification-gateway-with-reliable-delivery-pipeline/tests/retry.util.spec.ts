import { computeExponentialBackoffWithJitterMs } from "../repository_after/src/webhooks/utils/retry.util";

describe("retry.util", () => {
  it("computes exponential delays starting at 60s", () => {
    const noJitter = () => 0;
    expect(
      computeExponentialBackoffWithJitterMs(1, 60_000, 0.3, noJitter)
    ).toBe(60_000);
    expect(
      computeExponentialBackoffWithJitterMs(2, 60_000, 0.3, noJitter)
    ).toBe(120_000);
    expect(
      computeExponentialBackoffWithJitterMs(3, 60_000, 0.3, noJitter)
    ).toBe(240_000);
    expect(
      computeExponentialBackoffWithJitterMs(4, 60_000, 0.3, noJitter)
    ).toBe(480_000);
    expect(
      computeExponentialBackoffWithJitterMs(5, 60_000, 0.3, noJitter)
    ).toBe(960_000);
    expect(
      computeExponentialBackoffWithJitterMs(6, 60_000, 0.3, noJitter)
    ).toBe(1_920_000);
  });

  it("adds jitter between 0% and 30%", () => {
    const base = 60_000;
    const jitter = 0.3;

    const min = computeExponentialBackoffWithJitterMs(1, base, jitter, () => 0);
    const max = computeExponentialBackoffWithJitterMs(
      1,
      base,
      jitter,
      () => 0.999999
    );

    expect(min).toBe(base);
    expect(max).toBeLessThanOrEqual(Math.round(base * 1.3));
    expect(max).toBeGreaterThan(base);
  });
});
