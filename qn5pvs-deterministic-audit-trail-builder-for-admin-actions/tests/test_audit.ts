import * as assert from "assert";
import * as path from "path";

// We handle dynamic import to allow testing before/after states
const rawRepoPath = process.env.REPO_PATH || "../repository_after";
// Resolve absolute path to ensure require works reliably
const repoPath = path.resolve(__dirname, rawRepoPath);

let buildAuditTrail: any;

try {
  // Attempt to require the module.
  // We try 'audit_trail.ts' or 'audit_trail' depending on resolution
  const mod = require(path.join(repoPath, "audit_trail"));
  buildAuditTrail = mod.buildAuditTrail;
} catch (e: any) {
  console.error(`CRITICAL: Could not load audit_trail module from ${repoPath}`);
  console.error(e.message);
  process.exit(1);
}

if (typeof buildAuditTrail !== "function") {
  console.error(
    `CRITICAL: buildAuditTrail is not a function or not exported from ${repoPath}`,
  );
  process.exit(1);
}

// --- Test Helper Types ---
// Resembles the types in the implementation for assertion casting

function runTests() {
  console.log(`Running tests against: ${repoPath}`);
  let passed = 0;
  let failed = 0;

  const test = (name: string, fn: () => void) => {
    try {
      fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (e: any) {
      console.error(`[FAIL] ${name}`);
      console.error(e.message);
      // console.error(e.stack);
      failed++;
    }
  };

  // 1. Action Type Validation
  test("Requirement 1: Valid Action Types", () => {
    const types = ["CREATE", "UPDATE", "DELETE", "LOGIN", "LOGOUT"];
    const input = types.map((t) => ({
      actionType: t,
      occurredAt: new Date().toISOString(),
      actor: "user:1",
    }));
    const result = buildAuditTrail(input);
    assert.strictEqual(
      result.invalid.length,
      0,
      "All supported types should be valid",
    );
    assert.strictEqual(result.valid.length, 5);
  });

  test("Requirement 1: Invalid Action Types", () => {
    const input = [
      {
        actionType: "DESTROY", // Invalid
        occurredAt: new Date().toISOString(),
        actor: "user:1",
      },
    ];
    const result = buildAuditTrail(input);
    assert.strictEqual(result.valid.length, 0);
    assert.strictEqual(result.invalid.length, 1);
    assert.strictEqual(result.invalid[0].issues[0].code, "INVALID_ACTION_TYPE");
  });

  // 2. Timestamp Parsing and Normalization
  test("Requirement 2: Timestamp Parsing (String/Number/Date)", () => {
    const now = new Date();
    const input = [
      { actionType: "LOGIN", actor: "user:1", occurredAt: now.toISOString() }, // String
      { actionType: "LOGIN", actor: "user:1", occurredAt: now.getTime() }, // Number
      { actionType: "LOGIN", actor: "user:1", occurredAt: now }, // Date object
    ];
    const result = buildAuditTrail(input);
    assert.strictEqual(result.valid.length, 3);
    result.valid.forEach((entry: any) => {
      assert.strictEqual(entry.occurredAt, now.toISOString());
    });
  });

  test("Requirement 2: Invalid Timestamp", () => {
    const input = [
      { actionType: "LOGIN", actor: "user:1", occurredAt: "not-a-date" },
    ];
    const result = buildAuditTrail(input);
    assert.strictEqual(result.invalid.length, 1);
    assert.strictEqual(result.invalid[0].issues[0].code, "INVALID_TIMESTAMP");
  });

  // 3. Actor Resolution
  test("Requirement 3: Actor Normalization (String Format)", () => {
    const input = [
      { actionType: "LOGIN", occurredAt: new Date(), actor: "USER:123" },
      { actionType: "LOGIN", occurredAt: new Date(), actor: "service:svc-1" },
    ];
    const result = buildAuditTrail(input);
    assert.strictEqual(result.valid.length, 2);
    assert.strictEqual(result.valid[0].actor.actorType, "USER");
    assert.strictEqual(result.valid[0].actor.actorId, "123");
    assert.strictEqual(result.valid[0].actor.displayName, "123"); // Fallback

    assert.strictEqual(result.valid[1].actor.actorType, "SERVICE");
    assert.strictEqual(result.valid[1].actor.actorId, "svc-1");
  });

  test("Requirement 3: Actor Normalization (Object Format)", () => {
    const input = [
      {
        actionType: "LOGIN",
        occurredAt: new Date(),
        actor: { id: "456", type: "system", name: "SysBot" },
      },
    ];
    const result = buildAuditTrail(input);
    assert.strictEqual(result.valid[0].actor.actorType, "SYSTEM");
    assert.strictEqual(result.valid[0].actor.displayName, "SysBot");
  });

  test("Requirement 3: Invalid Actor", () => {
    const input = [
      { actionType: "LOGIN", occurredAt: new Date(), actor: "just-id" }, // Missing type
      { actionType: "LOGIN", occurredAt: new Date(), actor: {} }, // Empty object
    ];
    const result = buildAuditTrail(input);
    assert.strictEqual(result.invalid.length, 2);
    // Expect strict errors
  });

  // 4. Stable Event ID
  test("Requirement 4: Deterministic Event ID", () => {
    const input = {
      actionType: "UPDATE",
      occurredAt: "2023-01-01T00:00:00.000Z",
      actor: "user:1",
      entityId: "e1",
      entityType: "DOC",
      before: { a: 1 },
      after: { a: 2 },
    };
    // Run twice
    const res1 = buildAuditTrail([input]).valid[0];
    const res2 = buildAuditTrail([input]).valid[0]; // Same input object

    assert.ok(res1.eventId);
    assert.strictEqual(
      res1.eventId,
      res2.eventId,
      "Event ID must be deterministic",
    );

    // Change one thing
    const input2 = { ...input, occurredAt: "2023-01-01T00:00:00.001Z" };
    const res3 = buildAuditTrail([input2]).valid[0];
    assert.notStrictEqual(
      res1.eventId,
      res3.eventId,
      "Event ID must change with content",
    );
  });

  // 5. Summary Generation
  test("Requirement 5: Summaries", () => {
    const input = [
      {
        actionType: "CREATE",
        actor: "user:bob",
        entityType: "FILE",
        entityId: "f1",
        occurredAt: 0,
      },
      { actionType: "LOGIN", actor: "user:alice", occurredAt: 0 },
    ];
    const result = buildAuditTrail(input);
    // "must be normalized" -> user:bob -> displayName "bob"
    // actually my fallback logic uses ID if name missing. actor parsing logic: id "bob", type "USER". Display "bob".
    assert.ok(result.valid[0].summary.includes("bob created FILE:f1"));
    assert.ok(result.valid[1].summary.includes("alice logged in"));
  });

  // 6. Update Snapshot & Changes
  test("Requirement 6: Update Changes (Primitives)", () => {
    const input = [
      {
        actionType: "UPDATE",
        actor: "user:1",
        occurredAt: 0,
        before: { a: 1, b: "old", c: true, d: null },
        after: { a: 1, b: "new", c: false, d: "notnull" },
      },
    ];
    const valid = buildAuditTrail(input).valid[0];
    assert.strictEqual(valid.changes.length, 3);

    // a is unchanged -> not in list
    // b: old -> new (MODIFIED)
    const changeB = valid.changes.find((c: any) => c.fieldPath === "b");
    assert.deepStrictEqual(changeB, {
      fieldPath: "b",
      before: "old",
      after: "new",
      kind: "MODIFIED",
    });

    // c: true -> false (MODIFIED)
    const changeC = valid.changes.find((c: any) => c.fieldPath === "c");
    assert.deepStrictEqual(changeC, {
      fieldPath: "c",
      before: true,
      after: false,
      kind: "MODIFIED",
    });

    // d: null -> 'notnull' (MODIFIED)
    const changeD = valid.changes.find((c: any) => c.fieldPath === "d");
    assert.deepStrictEqual(changeD, {
      fieldPath: "d",
      before: null,
      after: "notnull",
      kind: "MODIFIED",
    });
  });

  test("Requirement 6: Nested Changes & Ignored Arrays", () => {
    const input = [
      {
        actionType: "UPDATE",
        actor: "user:1",
        occurredAt: 0,
        before: { meta: { v: 1 }, tags: ["a"], complex: { x: 1 } },
        after: { meta: { v: 2 }, tags: ["b"], complex: [1] }, // complex changed obj->array
      },
    ];
    const valid = buildAuditTrail(input).valid[0];

    // meta.v: 1 -> 2
    const changeMeta = valid.changes.find((c: any) => c.fieldPath === "meta.v");
    assert.ok(changeMeta, "Should detect nested change");
    assert.strictEqual(changeMeta.after, 2);

    // tags: array -> array. "If snapshots contain non-primitive values (arrays/objects), ignore those fields"
    // So tags should be ignored.
    const changeTags = valid.changes.find((c: any) => c.fieldPath === "tags");
    assert.strictEqual(changeTags, undefined, "Should ignore array fields");

    // complex: object -> array.
    // Before is object (recurse?), After is array (ignore?).
    // "Only compare JSON-safe primitives".
    // complex is not primitive in either. Should be ignored.
    const changeComplex = valid.changes.find((c: any) =>
      c.fieldPath.startsWith("complex"),
    );
    assert.strictEqual(
      changeComplex,
      undefined,
      "Should ignore complex type mismatches",
    );
  });

  test("Requirement 6: Validation of Snapshots", () => {
    const input = [
      {
        actionType: "UPDATE",
        actor: "user:1",
        occurredAt: 0,
        before: { a: 1 },
      }, // Missing after
      {
        actionType: "UPDATE",
        actor: "user:1",
        occurredAt: 0,
        before: 1,
        after: 2,
      }, // Not objects
    ];
    const result = buildAuditTrail(input);
    assert.strictEqual(result.invalid.length, 2);
    assert.strictEqual(result.invalid[0].issues[0].code, "INVALID_SNAPSHOTS");
    assert.strictEqual(result.invalid[1].issues[0].code, "INVALID_SNAPSHOTS");
  });

  // 7. Invalid Actions Handling
  test("Requirement 7: Separate Invalid Actions", () => {
    const input = [
      { actionType: "CREATE", actor: "user:1", occurredAt: 0 }, // Valid
      { actionType: "INVALID", actor: "user:1", occurredAt: 0 }, // Invalid
    ];
    const result = buildAuditTrail(input);
    assert.strictEqual(result.valid.length, 1);
    assert.strictEqual(result.invalid.length, 1);
    assert.strictEqual(result.invalid[0].action.actionType, "INVALID"); // Includes raw input
  });

  if (failed > 0) {
    console.error(`\n${failed} tests failed.`);
    process.exit(1);
  } else {
    console.log(`\nAll ${passed} tests passed.`);
    process.exit(0);
  }
}

runTests();
