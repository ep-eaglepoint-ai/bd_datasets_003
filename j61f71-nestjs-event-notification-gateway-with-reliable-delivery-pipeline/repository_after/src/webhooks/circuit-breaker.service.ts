import { Inject, Injectable } from "@nestjs/common";
import Redis from "ioredis";
import { CIRCUIT_COOLDOWN_MS, CIRCUIT_FAILURE_THRESHOLD } from "./constants";
import { REDIS_CLIENT } from "./redis.constants";

export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitSnapshot {
  state: CircuitState;
  failures: number;
  openedAt?: number;
}

@Injectable()
export class CircuitBreakerService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private key(endpointId: string) {
    return `webhook:circuit:${endpointId}`;
  }

  async getSnapshot(endpointId: string): Promise<CircuitSnapshot> {
    const data = await this.redis.hgetall(this.key(endpointId));
    const state = (data.state as CircuitState) || "closed";
    const failures = data.failures ? parseInt(data.failures, 10) : 0;
    const openedAt = data.openedAt ? parseInt(data.openedAt, 10) : undefined;
    return { state, failures, openedAt };
  }

  async canAttempt(
    endpointId: string,
    nowMs: number = Date.now()
  ): Promise<{ allowed: boolean; retryAfterMs?: number; state: CircuitState }> {
    const snapshot = await this.getSnapshot(endpointId);
    if (snapshot.state !== "open") {
      return { allowed: true, state: snapshot.state };
    }

    const openedAt = snapshot.openedAt ?? nowMs;
    const elapsed = nowMs - openedAt;
    if (elapsed < CIRCUIT_COOLDOWN_MS) {
      return {
        allowed: false,
        retryAfterMs: CIRCUIT_COOLDOWN_MS - elapsed,
        state: "open",
      };
    }

    await this.redis.hset(this.key(endpointId), { state: "half-open" });
    return { allowed: true, state: "half-open" };
  }

  async recordSuccess(endpointId: string): Promise<void> {
    await this.redis.hset(this.key(endpointId), {
      state: "closed",
      failures: 0,
    });
    await this.redis.hdel(this.key(endpointId), "openedAt");
  }

  async recordFailure(
    endpointId: string,
    nowMs: number = Date.now()
  ): Promise<CircuitSnapshot> {
    const failures = await this.redis.hincrby(
      this.key(endpointId),
      "failures",
      1
    );
    const current = await this.getSnapshot(endpointId);

    if (failures >= CIRCUIT_FAILURE_THRESHOLD) {
      await this.redis.hset(this.key(endpointId), {
        state: "open",
        openedAt: nowMs,
      });
      return { ...current, state: "open", failures, openedAt: nowMs };
    }

    return { ...current, failures };
  }

  async reset(endpointId: string): Promise<void> {
    await this.redis.del(this.key(endpointId));
  }
}
