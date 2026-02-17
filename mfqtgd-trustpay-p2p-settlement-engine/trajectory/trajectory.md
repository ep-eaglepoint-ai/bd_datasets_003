# Trajectory: TrustPay Social Ledger — P2P Settlement Engine (React + Express + Prisma)

This document records the engineering work completed to deliver a fullstack MVP that supports **atomic group settlements** with **fixed-point financial math** and **double-spend prevention**, plus a small React “Settlement Wizard” UI and an end-to-end test harness.

## Action 1: Data model for balances + settlement ledger
**Issue**: We need a schema that can represent user balances (in cents) and persist each settlement with a participant breakdown.

- **Action Taken**:
  - Implemented Prisma models:
    - `User(id, name, active, balanceCents)`
    - `Settlement(id, payerId, totalCents, createdAt)`
    - `SettlementItem(settlementId, participantId, amountCents)`
  - Stored balances as **integer cents** (`balanceCents`, `totalCents`, `amountCents`) to avoid floating point errors.
- **Reference**:
  - [Prisma schema reference](https://www.prisma.io/docs/orm/reference/prisma-schema-reference)

## Action 2: Atomic multi-account settlement (transactional integrity)
**Issue**: Group settlements must be **all-or-nothing**. If the process crashes mid-credit, the whole operation must roll back.

- **Action Taken**:
  - Implemented `settleGroup()` using `prisma.$transaction()` so payer debit + participant credits + settlement record creation succeed or fail as a single unit.
  - Added deterministic “failure injection” used only in tests (`x-debug-fail-after-credits`) to simulate a database error mid-transaction and confirm rollback behavior.
- **Reference**:
  - [Prisma transactions](https://www.prisma.io/docs/orm/prisma-client/queries/transactions)

## Action 3: Double-spend prevention inside the transaction
**Issue**: Two concurrent settlements can race and both pass an “outside the transaction” balance check, allowing negative balances.

- **Action Taken**:
  - Implemented an **in-transaction conditional debit**:
    - `updateMany(where: { id: payerId, balanceCents: { gte: totalCents } })`
    - If `count !== 1`, return a consistent `INSUFFICIENT_FUNDS` error.
  - This ensures only one of two concurrent requests can decrement the payer if the balance only covers one settlement.

## Action 4: Fixed-point split math (no “vanishing pennies”)
**Issue**: Even splits often produce rounding remainders; financial systems must account for every cent.

- **Action Taken**:
  - Implemented integer split logic (base + remainder distribution) so shares always sum exactly to `totalCents`.
  - Validated splits via tests (e.g., 100 cents split across 3 participants yields a deterministic distribution like `[34, 33, 33]`).
- **Reference**:
  - [OWASP: Cryptographic Storage](https://cheatsheetseries.owasp.org/) (general security posture; fixed-point money is a standard fintech hygiene practice)

## Action 5: Participant validation and consistent error handling
**Issue**: Any invalid participant (missing/inactive) must abort the entire settlement and return clear errors for UX.

- **Action Taken**:
  - Validated all participant IDs inside the transaction:
    - Existence (`PARTICIPANT_NOT_FOUND`)
    - Active flag (`PARTICIPANT_INACTIVE`)
  - Standardized API error shape via `AppError` and a single error middleware:
    - `{ error: { code, message, details? } }`

## Action 6: React Settlement Wizard (UX + optimistic UI)
**Issue**: The UI must display payer balance, prevent invalid submissions, show an in-progress state, and revert on errors.

- **Action Taken**:
  - Built a React wizard:
    - Select payer
    - Select participants
    - Enter total amount (string parsed to cents; supports `$` and commas)
    - “Split preview” to show per-participant shares + payer remaining balance pre-check
  - Implemented optimistic update for payer balance during settlement and revert-on-failure with code-mapped messages.
  - Vite proxy routes `/api/*` to backend `localhost:3001` for local dev.

## Action 7: Tests (partial failure + race condition + edge cases)
**Issue**: Must prove correctness under failure and concurrency, and verify validation/rounding edge cases.

- **Action Taken**:
  - Added integration tests validating:
    - **Partial Failure Rollback** (Requirement 6)
    - **Race Condition / Double-spend Prevention** (Requirement 7)
    - Edge cases: invalid amounts, payer included, empty participants, inactive/missing participants, duplicate participant IDs, remainder split determinism.
  - Kept tests in the dataset root `tests/` folder and wired a single `npm test` to run:
    - backend Jest tests
    - frontend Vitest smoke test

## Action 8: Containerization + evaluation
**Issue**: Need reproducible “test-after” and “evaluation” commands via Docker Compose.

- **Action Taken**:
  - Added `docker-compose.yml` services:
    - `frontend`, `backend` for local dev
    - `test-after` runs `npm test` (covers frontend + backend)
    - `evaluation` runs `npm run evaluation` and writes `evaluation/reports/report.json`
  - Implemented minimal `evaluation/evaluation.js` to capture test results and emit a standard report.

## Verification
- `npm test` passes (backend + frontend tests).
- `npm run evaluation` generates `evaluation/reports/report.json` with `success: true` when tests pass.

