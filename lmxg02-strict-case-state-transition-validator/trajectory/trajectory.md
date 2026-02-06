# Trajectory

1. Analyzed the Requirements
   I read through the problem statement which required building a strict state machine for case lifecycle management. The key challenges were: ensuring transitions are deterministic, never mutating input data, returning structured error reasons, and handling malformed inputs gracefully.

2. Designed the Type System
   I defined discriminated unions for both actions and results. Each action type (ASSIGN, START_WORK, REQUEST_CUSTOMER, RESOLVE, CLOSE, REOPEN) has its own interface with required fields. The result type uses a discriminated union with `ok: true/false` to distinguish success from failure cases.

3. Implemented the Transition Map
   I created a lookup table mapping each state to its allowed transitions. This makes the rules explicit and easy to verify:
   - NEW can only transition via ASSIGN
   - ASSIGNED can go to IN_PROGRESS or WAITING_CUSTOMER
   - IN_PROGRESS can go to WAITING_CUSTOMER or RESOLVED
   - WAITING_CUSTOMER can return to IN_PROGRESS or go to RESOLVED
   - RESOLVED can be CLOSED or REOPENED
   - CLOSED can only be REOPENED

4. Built Multi-Issue Validation
   The validator collects all applicable issues rather than short-circuiting on the first error. This is important for UI feedback where users need to know everything wrong with a request at once. Issues include UNKNOWN_ACTION, MISSING_REQUIRED_FIELD, and ILLEGAL_TRANSITION.

5. Ensured Immutability
   The applyCaseAction function creates a new Case object for successful transitions rather than modifying the input. This prevents subtle bugs where the same object might be referenced elsewhere in the application.

6. Handled Edge Cases
   I added handling for null/undefined actions, actions without a type property, empty/whitespace-only required fields, and completely unknown action types. All these return structured errors rather than throwing exceptions.

7. Implemented Applied Changes Tracking
   For successful transitions, the function returns an array of changes that were applied (STATE_CHANGED, ASSIGNEE_CHANGED, NOTE_ADDED). This provides an audit trail and allows the UI to update appropriately.

8. Wrote Comprehensive Tests
   I created tests covering: all valid transitions, all invalid transitions, unknown action types, missing required fields, multiple validation issues, immutability guarantees, determinism, complete workflows, and result structure validation.
