import Redis from "ioredis";
import { requireEnv } from "./env";

export function createTestRedis(): Redis {
  const host = requireEnv("REDIS_HOST", "localhost");
  const port = parseInt(requireEnv("REDIS_PORT", "6379"), 10);
  const db = parseInt(requireEnv("REDIS_DB", "15"), 10);

  return new Redis({ host, port, db, maxRetriesPerRequest: 2 });
}

export async function flushRedis(redis: Redis): Promise<void> {
  await redis.flushdb();
}
