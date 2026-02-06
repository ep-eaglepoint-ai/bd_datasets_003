
// featureFlags.ts
export type Variant = "control" | "treatment";

export type FlagConfig = {
  key: string;
  enabled: boolean;

  // % rollout to treatment (0..100)
  rolloutPct: number;

  // Optional: deterministic bucketing uses this seed
  seed?: string;

  // Optional: explicit overrides
  overrides?: {
    userIds?: Record<string, Variant>;
    orgIds?: Record<string, Variant>;
  };
};

export type ResolveContext = {
  user?: { id?: string; orgId?: string };
  // optional request metadata
  requestId?: string;
};

export type ResolveResult = {
  key: string;
  enabled: boolean;
  variant: Variant;
  reason: string; // e.g. "DISABLED", "USER_OVERRIDE", "ORG_OVERRIDE", "ROLLOUT_BUCKET"
};

function stableHashToPct(input: string): number {
  // Very simple deterministic hash → [0, 99]
  // (Intentionally simplistic to make test cases meaningful.)
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // force unsigned and map to 0..99
  return (h >>> 0) % 100;
}

export function resolveFlag(config: unknown, ctx: unknown): ResolveResult {
  // Defensive defaults
  const fallback: ResolveResult = {
    key: "",
    enabled: false,
    variant: "control",
    reason: "INVALID_INPUT",
  };

  if (typeof config !== "object" || config === null) return fallback;
  const c = config as Partial<FlagConfig>;

  const key = typeof c.key === "string" ? c.key : "";
  const enabled = c.enabled === true;

  // rolloutPct: clamp to 0..100, invalid → 0
  let rolloutPct = 0;
  if (typeof c.rolloutPct === "number" && Number.isFinite(c.rolloutPct)) {
    rolloutPct = Math.max(0, Math.min(100, Math.floor(c.rolloutPct)));
  }

  const seed = typeof c.seed === "string" ? c.seed : "default";

  const overrides = typeof c.overrides === "object" && c.overrides !== null ? c.overrides : undefined;

  const userId =
    typeof (ctx as any)?.user?.id === "string" ? ((ctx as any).user.id as string) : "";
  const orgId =
    typeof (ctx as any)?.user?.orgId === "string" ? ((ctx as any).user.orgId as string) : "";

  // Disabled flag: always control
  if (!enabled) {
    return { key, enabled, variant: "control", reason: "DISABLED" };
  }

  // User override beats org override beats rollout
  if (overrides?.userIds && userId && overrides.userIds[userId]) {
    return { key, enabled, variant: overrides.userIds[userId]!, reason: "USER_OVERRIDE" };
  }

  if (overrides?.orgIds && orgId && overrides.orgIds[orgId]) {
    return { key, enabled, variant: overrides.orgIds[orgId]!, reason: "ORG_OVERRIDE" };
  }

  // Rollout: deterministic bucket by (seed|key|userId|orgId)
  const bucketInput = `${seed}|${key}|${userId}|${orgId}`;
  const pct = stableHashToPct(bucketInput);

  const variant: Variant = pct < rolloutPct ? "treatment" : "control";
  return { key, enabled, variant, reason: "ROLLOUT_BUCKET" };
}
