// analyzeFeatureFlagRules.ts

export type Effect = "ENABLE" | "DISABLE";
export type Role = "admin" | "member" | "guest";
export type Status = "active" | "suspended";
export type Region = "US" | "EU" | "OTHER";
export type Plan = "free" | "pro" | "enterprise";

export type Rule = {
  ruleId: string;
  when: Partial<{
    role: Role;
    status: Status;
    region: Region;
    plan: Plan;
  }>;
  effect: Effect;
};

export type Finding = {
  code: string;
  ruleIds: string[];
  message: string;
  details?: Record<string, unknown>;
};

const ALLOWED_WHEN_KEYS = new Set(["role", "status", "region", "plan"]);
const EFFECTS: Effect[] = ["ENABLE", "DISABLE"];

function canonicalWhen(when: Rule["when"]): string {
  const keys = Object.keys(when).sort();
  return keys.map((k) => `${k}:${(when as any)[k]}`).join(",");
}

function isSubset(sub: Rule["when"], sup: Rule["when"]): boolean {
  for (const [k, v] of Object.entries(sub)) {
    if ((sup as any)[k] !== v) return false;
  }
  return true;
}

function overlaps(a: Rule["when"], b: Rule["when"]): boolean {
  for (const k of Object.keys(a)) {
    if (k in b && (a as any)[k] !== (b as any)[k]) return false;
  }
  return true;
}

function validate(rule: any): string[] {
  const errs: string[] = [];
  if (!rule || typeof rule !== "object") return ["Rule must be an object"];

  if (typeof rule.ruleId !== "string" || rule.ruleId.trim() === "") {
    errs.push("ruleId must be a non-empty string");
  }
  if (!rule.when || typeof rule.when !== "object") {
    errs.push("when must be an object");
  } else {
    for (const k of Object.keys(rule.when)) {
      if (!ALLOWED_WHEN_KEYS.has(k)) errs.push(`unknown when key: ${k}`);
    }
  }
  if (typeof rule.effect !== "string" || !EFFECTS.includes(rule.effect)) {
    errs.push("effect must be ENABLE or DISABLE");
  }
  return errs;
}

function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const c = a.code.localeCompare(b.code);
    if (c !== 0) return c;
    const ra = [...a.ruleIds].sort().join(",");
    const rb = [...b.ruleIds].sort().join(",");
    return ra.localeCompare(rb);
  });
}

/**
 * Static analyzer for feature-flag rules.
 * NOTE: This analyzer returns structured findings and sorts them deterministically.
 */
export function analyzeFeatureFlagRules(rules: Rule[]): Finding[] {
  const findings: Finding[] = [];
  const valid: Rule[] = [];

  // Validation
  for (const r of rules as any[]) {
    const errs = validate(r);
    if (errs.length) {
      findings.push({
        code: "INVALID_RULE",
        ruleIds: [String(r?.ruleId ?? "unknown")],
        message: errs.join("; "),
        details: { errors: errs },
      });
      continue;
    }
    valid.push(r);
  }

  // Group by canonical when
  const groups = new Map<string, Rule[]>();
  for (const r of valid) {
    const key = canonicalWhen(r.when);
    const arr = groups.get(key);
    if (arr) arr.push(r);
    else groups.set(key, [r]);
  }

  // Contradictions + redundancy
  for (const [key, arr] of groups.entries()) {
    const effects = new Set(arr.map((r) => r.effect));
    if (effects.size > 1) {
      findings.push({
        code: "DIRECT_CONTRADICTION",
        ruleIds: arr.map((r) => r.ruleId).sort(),
        message: `Same conditions (${key}) but conflicting effects`,
        details: { whenKey: key, effects: [...effects] },
      });
    }

    const byEffect = new Map<Effect, Rule[]>();
    for (const r of arr) {
      const earr = byEffect.get(r.effect);
      if (earr) earr.push(r);
      else byEffect.set(r.effect, [r]);
    }
    for (const [effect, earr] of byEffect.entries()) {
      if (earr.length > 1) {
        findings.push({
          code: "REDUNDANT_RULE",
          ruleIds: earr.map((r) => r.ruleId).sort(),
          message: `Same conditions (${key}) and same effect (${effect})`,
          details: { whenKey: key, effect },
        });
      }
    }
  }

  // Shadowed rules (subset + conflicting effect)
  for (const a of valid) {
    for (const b of valid) {
      if (a.ruleId === b.ruleId) continue;
      if (a.effect === b.effect) continue;
      if (!isSubset(b.when, a.when)) continue;

      findings.push({
        code: "SHADOWED_RULE",
        ruleIds: [a.ruleId, b.ruleId].sort(),
        message: `Rule ${a.ruleId} is shadowed by ${b.ruleId}`,
        // NOTE: details intentionally include when objects
        details: {
          shadowedWhen: a.when,
          shadowingWhen: b.when,
          shadowedEffect: a.effect,
          shadowingEffect: b.effect,
        },
      });
    }
  }

  // Ambiguous (overlap + conflicting effect + neither subset)
  for (let i = 0; i < valid.length; i++) {
    for (let j = i + 1; j < valid.length; j++) {
      const a = valid[i];
      const b = valid[j];
      if (a.effect === b.effect) continue;
      if (isSubset(a.when, b.when) || isSubset(b.when, a.when)) continue;
      if (!overlaps(a.when, b.when)) continue;

      findings.push({
        code: "AMBIGUOUS_RULE",
        ruleIds: [a.ruleId, b.ruleId].sort(),
        message: "Overlapping conditions with conflicting effects and no subset relationship",
        details: { aWhen: a.when, bWhen: b.when, aEffect: a.effect, bEffect: b.effect },
      });
    }
  }

  return sortFindings(findings);
}

