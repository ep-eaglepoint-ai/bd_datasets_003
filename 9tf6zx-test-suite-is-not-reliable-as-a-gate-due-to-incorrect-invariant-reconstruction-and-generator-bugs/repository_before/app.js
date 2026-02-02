import { test } from "node:test";
import assert from "node:assert";
import { applyWebhooks } from "./your-module.js"; // replace with actual path

// --- Deterministic seeded RNG (fast, no deps) ---
function makeRng(seed) {
  let s = seed >>> 0;
  return function rand() {
    // LCG: Numerical Recipes
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}
function randInt(rand, min, max) {
  return Math.floor(rand() * (max - min + 1)) + min;
}
function pick(rand, arr) {
  return arr[randInt(rand, 0, arr.length - 1)];
}
function randId(rand, len = 6) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[randInt(rand, 0, chars.length - 1)];
  return out;
}

// Helper: deep clone & freeze (immutability checks)
function deepClone(x) {
  return JSON.parse(JSON.stringify(x));
}
function deepFreeze(obj) {
  if (!obj || typeof obj !== "object") return obj;
  Object.freeze(obj);
  for (const k of Object.keys(obj)) deepFreeze(obj[k]);
  return obj;
}

// Helper: serialize Map/Set for stable deepEqual comparisons
function snap(result) {
  return {
    balances: Array.from(result.balances.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1)),
    canceledUsers: Array.from(result.canceledUsers).sort(),
    appliedEventIds: result.appliedEventIds.slice(),
  };
}

// --- 1) Immutability: array order + objects must not change ---
test("immutability: does not mutate input array or objects", () => {
  const events = [
    { provider: "stripe", providerEventId: "e1", type: "charge.succeeded", userId: "u1", amountCents: 100, currency: "USD", occurredAtMs: 5 },
    { provider: "adyen", providerEventId: "e2", type: "subscription.canceled", userId: "u2", amountCents: 0, currency: "EUR", occurredAtMs: 1 },
  ];
  const before = deepClone(events);
  deepFreeze(events);
  assert.doesNotThrow(() => applyWebhooks(events));
  assert.deepStrictEqual(events, before);
});

// --- 2) Dedup namespace: provider + eventId, first occurrence wins (even if payload differs) ---
test("dedup is by provider+eventId; first occurrence wins even if later differs", () => {
  const events = [
    { provider: "stripe", providerEventId: "x", type: "charge.succeeded", userId: "u1", amountCents: 500, currency: "USD", occurredAtMs: 10 },
    // same provider+id, different payload, earlier/later times shouldn't matter after sorting—dedup is by first in sorted order
    { provider: "stripe", providerEventId: "x", type: "charge.refunded", userId: "u1", amountCents: 999, currency: "USD", occurredAtMs: 20 },
  ];
  const r = applyWebhooks(events);
  assert.deepStrictEqual(r.appliedEventIds, ["x"]);
  assert.strictEqual(r.balances.get("u1"), 500);
});

// --- 3) Cross-provider collision: same eventId must NOT dedup across providers ---
test("same providerEventId across different providers must both apply", () => {
  const events = [
    { provider: "stripe", providerEventId: "same", type: "charge.succeeded", userId: "u1", amountCents: 100, currency: "USD", occurredAtMs: 1 },
    { provider: "paypal", providerEventId: "same", type: "charge.succeeded", userId: "u1", amountCents: 200, currency: "USD", occurredAtMs: 2 },
  ];
  const r = applyWebhooks(events);
  // can't disambiguate providers in appliedEventIds, so verify via balance effect
  assert.strictEqual(r.appliedEventIds.length, 2);
  assert.strictEqual(r.balances.get("u1"), 300);
});

// --- 4) Tie-breaking: stable by original input order when occurredAtMs equal ---
test("sorting tie-break: occurredAtMs ties resolve by original input order", () => {
  const events = [
    { provider: "stripe", providerEventId: "a", type: "charge.succeeded", userId: "u1", amountCents: 1, currency: "USD", occurredAtMs: 100 }, // idx 0
    { provider: "stripe", providerEventId: "b", type: "charge.succeeded", userId: "u1", amountCents: 1, currency: "USD", occurredAtMs: 100 }, // idx 1
    { provider: "stripe", providerEventId: "c", type: "charge.succeeded", userId: "u1", amountCents: 1, currency: "USD", occurredAtMs: 99 },  // idx 2 -> first
  ];
  const r = applyWebhooks(events);
  assert.deepStrictEqual(r.appliedEventIds, ["c", "a", "b"]);
});

// --- 5) Refund sign + cancellation isolation ---
test("refund subtracts; cancellation only affects canceledUsers and not balance", () => {
  const events = [
    { provider: "stripe", providerEventId: "1", type: "charge.succeeded", userId: "u1", amountCents: 1000, currency: "USD", occurredAtMs: 1 },
    { provider: "stripe", providerEventId: "2", type: "subscription.canceled", userId: "u1", amountCents: 999999, currency: "USD", occurredAtMs: 2 },
    { provider: "stripe", providerEventId: "3", type: "charge.refunded", userId: "u1", amountCents: 250, currency: "USD", occurredAtMs: 3 },
  ];
  const r = applyWebhooks(events);
  assert.strictEqual(r.balances.get("u1"), 750);
  assert.ok(r.canceledUsers.has("u1"));
});

// --- 6) Metamorphic: adding duplicates (same provider+id) must not change result ---
test("metamorphic: adding duplicate provider+eventId does not change outcome", () => {
  const base = [
    { provider: "stripe", providerEventId: "e1", type: "charge.succeeded", userId: "u1", amountCents: 100, currency: "USD", occurredAtMs: 10 },
    { provider: "adyen", providerEventId: "e2", type: "charge.refunded", userId: "u1", amountCents: 50, currency: "USD", occurredAtMs: 20 },
    { provider: "paypal", providerEventId: "e3", type: "subscription.canceled", userId: "u2", amountCents: 0, currency: "EUR", occurredAtMs: 30 },
  ];
  const withDups = base.concat([
    { ...base[0] }, // exact duplicate
    { ...base[1], amountCents: 999 }, // duplicate id but different payload, must be ignored
  ]);

  const r1 = snap(applyWebhooks(base));
  const r2 = snap(applyWebhooks(withDups));
  assert.deepStrictEqual(r2, r1);
});

// --- 7) Randomized adversarial metamorphic suite (bounded, deterministic) ---
// Note: Avoid reconstructing event application order from appliedEventIds because output lacks provider.
// Instead validate invariants that are inferable from the output contract.
test("randomized adversarial metamorphic checks (seeded, bounded)", () => {
  const rand = makeRng(1337);
  const providers = ["stripe", "adyen", "paypal"];
  const types = ["charge.succeeded", "charge.refunded", "subscription.canceled"];
  const currencies = ["USD", "EUR", "GBP"];

  const iterations = 40;   // bounded for CI
  const maxEvents = 60;

  for (let it = 0; it < iterations; it++) {
    const n = randInt(rand, 5, maxEvents);

    // Build a base event list with intentional adversarial patterns:
    // - out of order timestamps
    // - ties
    // - cross-provider same providerEventId
    // - within-provider duplicates with altered payloads
    const events = [];
    const seenKeys = []; // store [provider, providerEventId] pairs for duplicates

    for (let i = 0; i < n; i++) {
      const makeDup = rand() < 0.25 && seenKeys.length > 0;
      let provider, providerEventId;

      if (makeDup) {
        const pair = pick(rand, seenKeys); // [provider, id]
        provider = pair[0];
        providerEventId = pair[1];
      } else {
        provider = pick(rand, providers);
        providerEventId = randId(rand, 5);
        seenKeys.push([provider, providerEventId]);

        // 20% chance: introduce a cross-provider collision with same providerEventId
        if (rand() < 0.20) {
          const otherProvider = pick(rand, providers.filter(p => p !== provider));
          seenKeys.push([otherProvider, providerEventId]);
          events.push({
            provider: otherProvider,
            providerEventId,
            type: pick(rand, types),
            userId: "u" + randInt(rand, 1, 6),
            amountCents: 0, // may be overwritten below
            currency: pick(rand, currencies),
            occurredAtMs: randInt(rand, 0, 5000),
          });
        }
      }

      const type = pick(rand, types);
      const amount = type === "subscription.canceled" ? 0 : randInt(rand, 1, 5000);

      // 35% chance: force a timestamp tie with a previous event
      const occurredAtMs =
        events.length > 0 && rand() < 0.35
          ? events[randInt(rand, 0, events.length - 1)].occurredAtMs
          : randInt(rand, 0, 5000);

      events.push({
        provider,
        providerEventId,
        type,
        userId: "u" + randInt(rand, 1, 6),
        amountCents: amount,
        currency: pick(rand, currencies),
        occurredAtMs,
      });
    }

    const before = deepClone(events);
    const rBase = applyWebhooks(events);

    // Invariant A: input immutability
    assert.deepStrictEqual(events, before);

    // Invariant B: idempotence (pure function)
    const rAgain = applyWebhooks(events);
    assert.deepStrictEqual(snap(rAgain), snap(rBase));

    // Invariant C: adding duplicates cannot change outcome
    // Add duplicates for random subset of existing keys with altered payloads
    const dupEvents = events.slice();
    for (let k = 0; k < 10 && dupEvents.length < maxEvents + 20; k++) {
      const e = pick(rand, events);
      dupEvents.push({
        ...e,
        // mutate payload to ensure "first occurrence wins" is meaningful
        type: e.type === "charge.succeeded" ? "charge.refunded" : "charge.succeeded",
        amountCents: e.type === "subscription.canceled" ? 0 : (e.amountCents + 123),
        occurredAtMs: e.occurredAtMs + randInt(rand, -50, 50),
      });
    }
    const rDup = applyWebhooks(dupEvents);
    assert.deepStrictEqual(snap(rDup), snap(rBase));

    // Invariant D: cross-provider collisions should be able to affect balance (not deduped)
    // Construct a targeted pair and compare
    const eid = "collide_" + it;
    const targeted = [
      { provider: "stripe", providerEventId: eid, type: "charge.succeeded", userId: "uX", amountCents: 111, currency: "USD", occurredAtMs: 1 },
      { provider: "paypal", providerEventId: eid, type: "charge.succeeded", userId: "uX", amountCents: 222, currency: "USD", occurredAtMs: 2 },
    ];
    const tRes = applyWebhooks(targeted);
    assert.strictEqual(tRes.balances.get("uX"), 333);
    assert.strictEqual(tRes.appliedEventIds.length, 2);
  }
});
