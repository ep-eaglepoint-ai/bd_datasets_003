# LMXG02 - Strict Case State Transition Validator

A TypeScript module that enforces a strict workflow for support or operations cases. Each case can be in only one state at a time, and only specific actions are allowed from each state.

## Overview

This module manages the lifecycle of a Case (support or operations ticket) through a strict state machine:

- **States**: NEW → ASSIGNED → IN_PROGRESS → WAITING_CUSTOMER → RESOLVED → CLOSED
- **Actions**: ASSIGN, START_WORK, REQUEST_CUSTOMER, RESOLVE, CLOSE, REOPEN

## Running Tests

### Test Against After Implementation
```bash
docker compose run --rm test-after
```

### Run Evaluation
```bash
docker compose run --rm evaluation
```

## API

```typescript
applyCaseAction(caseItem: Case, action: CaseAction): CaseActionResult
```

Where `CaseActionResult` is one of:
- `{ ok: true; updated: Case; applied: AppliedChange[] }` - Success
- `{ ok: false; reasons: TransitionIssue[] }` - Failure with structured reasons
