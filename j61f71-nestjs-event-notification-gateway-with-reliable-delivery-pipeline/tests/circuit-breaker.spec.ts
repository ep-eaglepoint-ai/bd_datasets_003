import { CircuitBreakerService } from "../repository_after/src/webhooks/circuit-breaker.service";

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

describe("CircuitBreakerService", () => {
  it("opens after 5 failures and half-opens after cooldown", async () => {
    const redis = new FakeRedis() as any;
    const svc = new CircuitBreakerService(redis);

    const endpointId = "ep_1";
    const t0 = 1_000_000;

    for (let i = 0; i < 5; i++) {
      await svc.recordFailure(endpointId, t0);
    }

    const snap = await svc.getSnapshot(endpointId);
    expect(snap.state).toBe("open");
    expect(snap.failures).toBe(5);

    const blocked = await svc.canAttempt(endpointId, t0 + 10_000);
    expect(blocked.allowed).toBe(false);

    const probe = await svc.canAttempt(endpointId, t0 + 61_000);
    expect(probe.allowed).toBe(true);
    expect(probe.state).toBe("half-open");

    await svc.recordSuccess(endpointId);
    const closed = await svc.getSnapshot(endpointId);
    expect(closed.state).toBe("closed");
    expect(closed.failures).toBe(0);
  });
});
