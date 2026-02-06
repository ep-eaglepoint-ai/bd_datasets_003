export type CaseState =
  | "NEW"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "WAITING_CUSTOMER"
  | "RESOLVED"
  | "CLOSED";

export interface Case {
  id: string;
  state: CaseState;
  assigneeId?: string;
  resolutionNote?: string;
  reopenReason?: string;
}

export type AssignAction = {
  type: "ASSIGN";
  assigneeId: string;
};

export type StartWorkAction = {
  type: "START_WORK";
};

export type RequestCustomerAction = {
  type: "REQUEST_CUSTOMER";
};

export type ResolveAction = {
  type: "RESOLVE";
  resolutionNote: string;
};

export type CloseAction = {
  type: "CLOSE";
};

export type ReopenAction = {
  type: "REOPEN";
  reason: string;
};

export type CaseAction =
  | AssignAction
  | StartWorkAction
  | RequestCustomerAction
  | ResolveAction
  | CloseAction
  | ReopenAction;

export type ChangeCode =
  | "STATE_CHANGED"
  | "ASSIGNEE_CHANGED"
  | "NOTE_ADDED";

export interface AppliedChange {
  code: ChangeCode;
  from?: string;
  to?: string;
}

export type IssueCode =
  | "UNKNOWN_ACTION"
  | "MISSING_REQUIRED_FIELD"
  | "ILLEGAL_TRANSITION";

export interface TransitionIssue {
  code: IssueCode;
  message: string;
  field?: string;
}

export type CaseActionResult =
  | { ok: true; updated: Case; applied: AppliedChange[] }
  | { ok: false; reasons: TransitionIssue[] };

const VALID_ACTION_TYPES = new Set([
  "ASSIGN",
  "START_WORK",
  "REQUEST_CUSTOMER",
  "RESOLVE",
  "CLOSE",
  "REOPEN",
]);

const TRANSITION_MAP: Record<CaseState, Partial<Record<string, CaseState>>> = {
  NEW: {
    ASSIGN: "ASSIGNED",
  },
  ASSIGNED: {
    START_WORK: "IN_PROGRESS",
    REQUEST_CUSTOMER: "WAITING_CUSTOMER",
  },
  IN_PROGRESS: {
    REQUEST_CUSTOMER: "WAITING_CUSTOMER",
    RESOLVE: "RESOLVED",
  },
  WAITING_CUSTOMER: {
    START_WORK: "IN_PROGRESS",
    RESOLVE: "RESOLVED",
  },
  RESOLVED: {
    CLOSE: "CLOSED",
    REOPEN: "IN_PROGRESS",
  },
  CLOSED: {
    REOPEN: "IN_PROGRESS",
  },
};

function isValidActionType(type: unknown): type is CaseAction["type"] {
  return typeof type === "string" && VALID_ACTION_TYPES.has(type);
}

function validateActionFields(action: CaseAction): TransitionIssue[] {
  const issues: TransitionIssue[] = [];

  switch (action.type) {
    case "ASSIGN":
      if (!action.assigneeId || typeof action.assigneeId !== "string" || action.assigneeId.trim() === "") {
        issues.push({
          code: "MISSING_REQUIRED_FIELD",
          message: "ASSIGN action requires assigneeId",
          field: "assigneeId",
        });
      }
      break;
    case "RESOLVE":
      if (!action.resolutionNote || typeof action.resolutionNote !== "string" || action.resolutionNote.trim() === "") {
        issues.push({
          code: "MISSING_REQUIRED_FIELD",
          message: "RESOLVE action requires resolutionNote",
          field: "resolutionNote",
        });
      }
      break;
    case "REOPEN":
      if (!action.reason || typeof action.reason !== "string" || action.reason.trim() === "") {
        issues.push({
          code: "MISSING_REQUIRED_FIELD",
          message: "REOPEN action requires reason",
          field: "reason",
        });
      }
      break;
  }

  return issues;
}

function isTransitionAllowed(currentState: CaseState, actionType: string): boolean {
  const allowedTransitions = TRANSITION_MAP[currentState];
  return allowedTransitions !== undefined && actionType in allowedTransitions;
}

function getNextState(currentState: CaseState, actionType: string): CaseState | undefined {
  return TRANSITION_MAP[currentState]?.[actionType];
}

export function applyCaseAction(caseItem: Case, action: unknown): CaseActionResult {
  const issues: TransitionIssue[] = [];

  if (!action || typeof action !== "object" || !("type" in action)) {
    return {
      ok: false,
      reasons: [{
        code: "UNKNOWN_ACTION",
        message: "Action must be an object with a type property",
      }],
    };
  }

  const actionObj = action as { type: unknown };

  if (!isValidActionType(actionObj.type)) {
    issues.push({
      code: "UNKNOWN_ACTION",
      message: `Unknown action type: ${String(actionObj.type)}`,
    });
  }

  if (issues.length > 0) {
    return { ok: false, reasons: issues };
  }

  const typedAction = action as CaseAction;
  const fieldIssues = validateActionFields(typedAction);
  issues.push(...fieldIssues);

  if (!isTransitionAllowed(caseItem.state, typedAction.type)) {
    issues.push({
      code: "ILLEGAL_TRANSITION",
      message: `Cannot perform ${typedAction.type} from state ${caseItem.state}`,
    });
  }

  if (issues.length > 0) {
    return { ok: false, reasons: issues };
  }

  const nextState = getNextState(caseItem.state, typedAction.type);
  if (!nextState) {
    return {
      ok: false,
      reasons: [{
        code: "ILLEGAL_TRANSITION",
        message: `Cannot perform ${typedAction.type} from state ${caseItem.state}`,
      }],
    };
  }

  const applied: AppliedChange[] = [];
  const updated: Case = {
    id: caseItem.id,
    state: nextState,
    assigneeId: caseItem.assigneeId,
    resolutionNote: caseItem.resolutionNote,
    reopenReason: caseItem.reopenReason,
  };

  applied.push({
    code: "STATE_CHANGED",
    from: caseItem.state,
    to: nextState,
  });

  switch (typedAction.type) {
    case "ASSIGN":
      updated.assigneeId = typedAction.assigneeId;
      applied.push({
        code: "ASSIGNEE_CHANGED",
        from: caseItem.assigneeId,
        to: typedAction.assigneeId,
      });
      break;
    case "RESOLVE":
      updated.resolutionNote = typedAction.resolutionNote;
      applied.push({
        code: "NOTE_ADDED",
        to: typedAction.resolutionNote,
      });
      break;
    case "REOPEN":
      updated.reopenReason = typedAction.reason;
      applied.push({
        code: "NOTE_ADDED",
        to: typedAction.reason,
      });
      break;
  }

  return { ok: true, updated, applied };
}
