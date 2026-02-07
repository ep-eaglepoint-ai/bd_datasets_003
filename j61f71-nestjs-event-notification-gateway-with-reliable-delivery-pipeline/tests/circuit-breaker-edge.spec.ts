import { CircuitBreakerService } from "../repository_after/src/webhooks/circuit-breaker.service";

// Mock implementation of Redis for testing logic purely
class FakeRedis {
  private store = new Map<string, Record<string, string>>();

  async hgetall(key: string) {
    return this.store.get(key) ?? {};
  }

  async hset(key: string, value: Record<string, any>) {
    const existing = this.store.get(key) ?? {};
    const next: Record<string, string> = { ...existing };
    for (const [k, v] of Object.entries(value)) {
      next[k] = String(v);
    }
    this.store.set(key, next);
    return 1;
  }

  async hincrby(key: string, field: string, incr: number) {
    const existing = this.store.get(key) ?? {};
    const current = existing[field] ? parseInt(existing[field], 10) : 0;
    const next = current + incr;
    existing[field] = String(next);
    this.store.set(key, existing);
    return next;
  }

  async hdel(key: string, field: string) {
    const existing = this.store.get(key) ?? {};
    delete existing[field];
    this.store.set(key, existing);
    return 1;
  }

  async del(key: string) {
    this.store.delete(key);
    return 1;
  }
}

describe("Circuit Breaker Edge Cases (Req 6)", () => {
  // Req 6 Edge 1: Failure count = 4 (Threshold - 1) -> Should remain closed
  it("remains closed when failures are just below threshold (4 failures)", async () => {
    const redis = new FakeRedis() as any;
    const svc = new CircuitBreakerService(redis);
    const endpointId = "edge_1";
    const t0 = 1000;

    for (let i = 0; i < 4; i++) {
      await svc.recordFailure(endpointId, t0);
    }

    const snap = await svc.getSnapshot(endpointId);
    expect(snap.state).toBe("closed");
    expect(snap.failures).toBe(4);

    const check = await svc.canAttempt(endpointId, t0 + 100);
    expect(check.allowed).toBe(true);
  });

  // Req 6 Edge 2: Half-open Cooldown Boundary (t < 60s vs t = 60s)
  it("respects exact cooldown boundary", async () => {
    const redis = new FakeRedis() as any;
    const svc = new CircuitBreakerService(redis);
    const endpointId = "edge_2";
    const t0 = 1000;

    // Open the circuit
    for (let i = 0; i < 5; i++) {
      await svc.recordFailure(endpointId, t0);
    }

    // Just before cooldown (59,999ms elapsed) -> 60s = 60,000ms
    const tBefore = t0 + 60_000 - 1;
    const checkBefore = await svc.canAttempt(endpointId, tBefore);
    expect(checkBefore.allowed).toBe(false);

    // Exact cooldown (60,000ms elapsed)
    const tAfter = t0 + 60_000;
    const checkAfter = await svc.canAttempt(endpointId, tAfter);
    expect(checkAfter.allowed).toBe(true);
    expect(checkAfter.state).toBe("half-open");
  });
});
