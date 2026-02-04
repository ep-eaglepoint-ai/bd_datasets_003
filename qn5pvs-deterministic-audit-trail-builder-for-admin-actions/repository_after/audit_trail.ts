import * as crypto from "crypto";

// --- Type Definitions ---

export type ActionType = "CREATE" | "UPDATE" | "DELETE" | "LOGIN" | "LOGOUT";
export const VALID_ACTION_TYPES: Set<string> = new Set([
  "CREATE",
  "UPDATE",
  "DELETE",
  "LOGIN",
  "LOGOUT",
]);

export interface RawAction {
  actionType: string;
  occurredAt: string | number | Date;
  actor: any; // Can be string, object, etc.
  entityType?: string;
  entityId?: string;
  before?: any;
  after?: any;
  [key: string]: any; // Allow other extra fields
}

export type ActorType = "USER" | "SERVICE" | "SYSTEM";

export interface AuditActor {
  actorId: string;
  actorType: ActorType;
  displayName: string;
}

export interface Change {
  fieldPath: string;
  before: string | number | boolean | null;
  after: string | number | boolean | null;
  kind: "ADDED" | "REMOVED" | "MODIFIED" | "UNCHANGED";
}

export interface AuditEntry {
  eventId: string;
  actionType: ActionType;
  occurredAt: string; // ISO 8601
  actor: AuditActor;
  entity?: string; // Derived from entityType + entityId
  summary: string;
  changes: Change[];
}

export interface ValidationIssue {
  code: string;
  field: string;
  message: string;
}

export interface InvalidAction {
  action: RawAction;
  issues: ValidationIssue[];
}

export interface AuditBuildResult {
  valid: AuditEntry[];
  invalid: InvalidAction[];
}

// --- Implementation ---

export function buildAuditTrail(input: RawAction[]): AuditBuildResult {
  const result: AuditBuildResult = { valid: [], invalid: [] };

  for (const action of input) {
    const issues: ValidationIssue[] = [];

    // 1. Validate Action Type
    if (!VALID_ACTION_TYPES.has(action.actionType)) {
      issues.push({
        code: "INVALID_ACTION_TYPE",
        field: "actionType",
        message: `Action type '${action.actionType}' is not supported.`,
      });
    }

    // 2. Validate & Normalize Timestamp
    let normalizedOccurredAt: string | null = null;
    try {
      const date = new Date(action.occurredAt);
      if (isNaN(date.getTime())) {
        throw new Error("Invalid date");
      }
      normalizedOccurredAt = date.toISOString();
    } catch (e) {
      issues.push({
        code: "INVALID_TIMESTAMP",
        field: "occurredAt",
        message: "occurredAt could not be parsed into a valid Date.",
      });
    }

    // 3. Validate & Normalize Actor
    let normalizedActor: AuditActor | null = null;
    try {
      normalizedActor = normalizeActor(action.actor);
    } catch (e: any) {
      issues.push({
        code: "INVALID_ACTOR",
        field: "actor",
        message: e.message || "Actor could not be resolved.",
      });
    }

    // 4. Validate Snapshots (for UPDATE)
    if (action.actionType === "UPDATE") {
      const hasBefore = action.before !== undefined && action.before !== null;
      const hasAfter = action.after !== undefined && action.after !== null;

      if (hasBefore || hasAfter) {
        // If one exists, both must exist and be objects
        if (!hasBefore || !hasAfter) {
          issues.push({
            code: "INVALID_SNAPSHOTS",
            field: "before/after",
            message:
              "Both before and after snapshots must be present if one is provided.",
          });
        } else if (
          typeof action.before !== "object" ||
          typeof action.after !== "object" ||
          Array.isArray(action.before) ||
          Array.isArray(action.after)
        ) {
          issues.push({
            code: "INVALID_SNAPSHOTS",
            field: "before/after",
            message: "Snapshots must be plain objects.",
          });
        }
      }
    }

    if (issues.length > 0) {
      result.invalid.push({ action, issues });
      continue;
    }

    // Basic fields are valid, proceed to build AuditEntry
    // normalizedOccurredAt and normalizedActor are guaranteed not null here if issues is empty (because we checked)
    if (!normalizedOccurredAt || !normalizedActor) {
      // Should not happen logic-wise but strict null check
      result.invalid.push({
        action,
        issues: [
          {
            code: "UNKNOWN",
            field: "general",
            message: "Unexpected parsing error",
          },
        ],
      });
      continue;
    }

    // Entity derivation
    let entityString: string | undefined;
    if (action.entityType && action.entityId) {
      entityString = `${action.entityType}:${action.entityId}`;
    } else if (action.entityId) {
      entityString = `Entity:${action.entityId}`;
    } else if (action.entityType) {
      entityString = `${action.entityType}:Unknown`;
    } else {
      entityString = undefined;
    }

    // Summary Generation
    const summary = generateSummary(
      action.actionType as ActionType,
      normalizedActor.displayName,
      entityString,
    );

    // Change Extraction
    let changes: Change[] = [];
    if (action.actionType === "UPDATE" && action.before && action.after) {
      changes = extractChanges(action.before, action.after);
    }

    // Stable Event ID
    const eventId = generateEventId(
      action.actionType,
      normalizedOccurredAt,
      normalizedActor.actorId,
      action.entityId,
      action.entityType,
      changes,
    );

    const entry: AuditEntry = {
      eventId,
      actionType: action.actionType as ActionType,
      occurredAt: normalizedOccurredAt,
      actor: normalizedActor,
      entity: entityString,
      summary,
      changes,
    };

    result.valid.push(entry);
  }

  return result;
}

// --- Helper Functions ---

function normalizeActor(rawActor: any): AuditActor {
  if (!rawActor) throw new Error("Actor is missing or empty.");

  let id = "";
  let type: ActorType | null = null;
  let name = "";

  if (typeof rawActor === "string") {
    // Try "type:id"
    const parts = rawActor.split(":");
    if (parts.length === 2 && isValidActorType(parts[0])) {
      type = parts[0].toUpperCase() as ActorType;
      id = parts[1];
    } else {
      // Treat specific fallback logic or fail
      // If just ID provided, we can't infer type reliably unless we have rules.
      // Requirement says: "If actor cannot be resolved into a valid actorId and actorType... reject"
      // Exception: maybe inferred from context? No, keep it strict string format "TYPE:ID" or reject?
      // Prompt says "Handle ... colon-delimited strings, raw IDs".
      // If raw ID "123" is passed, we probably can't guess type.
      // Let's assume raw string without colon is INVALID unless we want to default roughly.
      // But let's look at "raw IDs". If inputs are inconsistent, maybe we assume "USER" if it looks like email?
      // Let's stick to: Must parse type.
      // IF rawActor is just "admin", maybe it's USER:admin?
      // Let's try to be helpful but strict on requirement 3.
      throw new Error('Actor string format must be "TYPE:ID".');
    }
  } else if (typeof rawActor === "object") {
    id = rawActor.id || rawActor.actorId || rawActor.userId || "";

    let rawType = rawActor.type || rawActor.actorType || rawActor.kind;
    if (!rawType && rawActor.email) rawType = "USER"; // Inference

    if (typeof rawType === "string") {
      if (isValidActorType(rawType)) {
        type = rawType.toUpperCase() as ActorType;
      }
    }

    name =
      rawActor.name ||
      rawActor.displayName ||
      rawActor.fullName ||
      rawActor.email ||
      rawActor.username ||
      "";
  }

  if (!id || !id.trim()) throw new Error("Actor ID is missing.");
  if (!type) throw new Error("Actor Type could not be determined.");

  // Fallback name
  if (!name || !name.trim()) {
    name = id; // Fallback to ID
  }

  return {
    actorId: id.trim(),
    actorType: type,
    displayName: name.trim(),
  };
}

function isValidActorType(t: string): boolean {
  const norm = t.toUpperCase();
  return norm === "USER" || norm === "SERVICE" || norm === "SYSTEM";
}

function generateSummary(
  type: ActionType,
  actorName: string,
  entityString: string | undefined,
): string {
  const ent = entityString || "Unknown Entity";
  switch (type) {
    case "CREATE":
      return `${actorName} created ${ent}`;
    case "UPDATE":
      return `${actorName} updated ${ent}`;
    case "DELETE":
      return `${actorName} deleted ${ent}`;
    case "LOGIN":
      return `${actorName} logged in`;
    case "LOGOUT":
      return `${actorName} logged out`;
    default:
      return `${actorName} performed ${type}`;
  }
}

function isPrimitive(val: any): boolean {
  return (
    val === null ||
    typeof val === "string" ||
    typeof val === "number" ||
    typeof val === "boolean"
  );
}

function extractChanges(before: any, after: any, prefix = ""): Change[] {
  let result: Change[] = [];
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of allKeys) {
    const path = prefix ? `${prefix}.${key}` : key;
    const vBefore = before[key];
    const vAfter = after[key];

    // "Only compare JSON-safe primitives ... If a field value is an array/object, ignore that field during change extraction"
    // But what if we recurse? "dot-paths for nested fields".
    // This usually implies we recurse into objects. The exclusion probably means "don't treating [1,2] vs [1,3] as a simple value change, and don't dump the whole object check".
    // OR it means "Ignore array/object VALUES".
    // "If snapshots contain non-primitive values (arrays/objects), ignore those fields in change generation"
    // This suggests we RECURSE into objects, but if we hit an ARRAY, we skip it? Or if we hit a leaf that is object?

    // Interpretation:
    // 1. If both are objects (and not null), recurse.
    // 2. If one is object/array and other is primitive -> Change? Or Ignore?
    // Prompt: "If snapshots contain non-primitive values (arrays/objects), ignore those fields... Only compare JSON-safe primitives"
    // This likely means: If I encounter a key where the value is an object, I traverse it. If I encounter an ARRAY, I ignore it (complex).
    // Let's recurse on plain objects.

    const isObjBefore =
      vBefore !== null &&
      typeof vBefore === "object" &&
      !Array.isArray(vBefore);
    const isObjAfter =
      vAfter !== null && typeof vAfter === "object" && !Array.isArray(vAfter);

    if (isObjBefore && isObjAfter) {
      result = result.concat(extractChanges(vBefore, vAfter, path));
      continue;
    }

    // If one of them is an object/array and we didn't recurse (because mismatch or array), ignore?
    // "Only compare JSON-safe primitives"
    // Check if values are primitives.
    const beforeIsPrim = isPrimitive(vBefore);
    const afterIsPrim = isPrimitive(vAfter);

    if (!beforeIsPrim || !afterIsPrim) {
      // at least one is complex (array/object/undefined?)
      // We skip.
      continue;
    }

    // Both are primitives or null. Compare.
    if (vBefore !== vAfter) {
      let kind: Change["kind"] = "MODIFIED";
      if (vBefore === undefined || vBefore === null) kind = "ADDED"; // Or MODIFIED? "before (primitive or null)"
      // Actually, if key didn't exist? undefined vs null.
      // Requirement: "before (primitive or null)". Undefined usually treated as missing/null in JSON land.

      // Refine kind logic:
      // If before was undefined (missing key) -> ADDED
      // If after is undefined (missing key) -> REMOVED
      // But we collected keys from both.

      let finalBefore = vBefore;
      let finalAfter = vAfter;

      if (vBefore === undefined) {
        kind = "ADDED";
        finalBefore = null;
      } else if (vAfter === undefined) {
        kind = "REMOVED";
        finalAfter = null;
      } else {
        kind = "MODIFIED";
      }

      // Special Case: Null vs Undefined match?
      // If before is null and after is undefined?
      // "Only include changes where kind !== "UNCHANGED"."

      // Let's normalize undefined to null for value storage, but use undefined for kind detection.

      result.push({
        fieldPath: path,
        before: finalBefore ?? null,
        after: finalAfter ?? null,
        kind: kind,
      });
    }
  }
  return result;
}

function generateEventId(
  type: string,
  time: string,
  actorId: string,
  entId: string | undefined,
  entType: string | undefined,
  changes: Change[],
): string {
  // Stable ID based on content.
  // We concatenate key fields and hash.
  // Also include changes summary to differentiate updates at same ms? "No randomness".

  // Sort changes to ensure stability
  const sortedChanges = changes
    .map((c) => `${c.fieldPath}:${c.before}->${c.after}`)
    .sort()
    .join("|");

  const payload = [
    type,
    time,
    actorId,
    entId || "",
    entType || "",
    sortedChanges,
  ].join("|");

  const hash = crypto.createHash("sha256").update(payload).digest("hex");
  return hash;
}

// Example usage and types export (as requested in "Deliverable Outputs... Include an inline comment example")
/*
Example Usage:

const rawInput: RawAction[] = [
  {
    actionType: 'UPDATE',
    occurredAt: '2023-10-27T10:00:00Z',
    actor: { id: 'u-123', type: 'USER', name: 'Alice' },
    entityType: 'ORDER',
    entityId: 'o-999',
    before: { status: 'PENDING', amount: 100 },
    after: { status: 'SHIPPED', amount: 100 }
  }
];

const result = buildAuditTrail(rawInput);

Output Result.valid[0]:
{
  eventId: "a1b2c3...",
  actionType: "UPDATE",
  occurredAt: "2023-10-27T10:00:00.000Z",
  actor: { actorId: "u-123", actorType: "USER", displayName: "Alice" },
  entity: "ORDER:o-999",
  summary: "Alice updated ORDER:o-999",
  changes: [
    { fieldPath: "status", before: "PENDING", after: "SHIPPED", kind: "MODIFIED" }
  ]
}
*/
