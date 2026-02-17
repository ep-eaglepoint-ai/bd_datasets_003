# Trajectory: SwiftTask Collaborative Board (Next.js + Prisma) with OCC + Optimistic UI

**Objective:** Build a lightweight project management tool called **SwiftTask** from scratch: a shared board where team members can create tasks and move them between three columns (**To Do**, **In Progress**, **Done**) while preventing the concurrent-edit “Overwriting” problem.

---

## 1. Clarify the Real Problem: Prevent Silent Overwrites

The first step is recognizing that a Kanban UI is not the hard part; concurrency is.

When two people interact with the same task at roughly the same time—one editing details while another changes status—naive “last write wins” behavior causes silent data loss. That is exactly what the requirements call out, so the design goal becomes:

- Accept updates only when the client’s view is current.
- If the client is stale, reject the update and clearly surface a conflict.

Auto-merging isn’t required here, so the safest minimal behavior is: reject stale updates and let the UI revert and communicate the conflict.

---

## 2. Define a Concurrency Contract (OCC)

To solve the overwriting problem with minimal complexity, an Optimistic Concurrency Control contract is established:

- Every task carries a concurrency token (`version` integer and/or `updatedAt`).
- The client sends `expectedVersion` with any update.
- The server commits changes only if `expectedVersion` matches the row’s current `version`.

This creates three important properties:

- Stale clients can’t overwrite newer data.
- Conflicts are deterministic (no heisenbugs).
- Simultaneous updates resolve cleanly: one wins, the other conflicts.

---

## 3. Design the Data Model to Enforce “Exactly Three Columns”

Since this is a shared board, integrity has to be enforced at the data layer, not just in the UI.

The plan:

- Use a Prisma enum `TaskStatus` with exactly `TODO`, `IN_PROGRESS`, `DONE`.
- Add `version Int @default(1)` to tasks.
- Keep `updatedAt @updatedAt` to provide timestamp visibility and audit usefulness.

With an enum, invalid statuses become impossible to store, even if a client tries to send nonsense.

---

## 4. Keep All Persistence Behind Next.js Server Actions

The backend requirement is explicit: all Prisma interactions stay inside Next.js Server Actions.

That means the client does not talk to Prisma or a database layer directly. Instead:

- `listTasksAction` reads tasks.
- `createTaskAction` validates and creates tasks.
- `updateTaskAction` validates and applies updates using OCC.

This keeps the client “dumb” (send `id` + proposed changes), while the server remains the single authority for validation and persistence.

---

## 5. Implement OCC as an Atomic Conditional Update

The core idea is to treat an update like a compare-and-swap:

- Attempt update only where `{ id, version: expectedVersion }` matches.
- Increment `version` inside the same write.

Using `updateMany` rather than `update` is intentional: it returns a count and avoids throwing when the version mismatch occurs.

A transaction then clarifies what happened:

- If no rows updated, fetch the row:
  - Missing row → `NOT_FOUND`.
  - Existing row with different version → `CONFLICT`.

This achieves two required behaviors at once:

- “User A stale version after User B update” reliably fails.
- “Two simultaneous moves” reliably results in only one success.

---

## 6. Make the UI Feel Instant (Optimistic UI) Without Losing Correctness

The UI must be responsive, so moves should appear instantly.

The approach:

- Use React `useOptimistic` so the card visibly moves between columns immediately.
- Kick off the server update in a transition.
- If the server rejects the change (`CONFLICT`) or the request fails (offline/network), revert to the pre-move snapshot.

This preserves the “snappy board” feel while still guaranteeing correctness: the UI never commits to a state the server didn’t accept.

---

## 7. Prove the Required Edge Cases With Tests

Two scenarios are non-negotiable per the spec:

1. **Stale Update**

   - A task is fetched at version 1.
   - Another user updates it (version becomes 2).
   - The original client attempts an update using expectedVersion 1.
   - Result must be `CONFLICT`.

2. **Offline Rollback**
   - Move a task and verify the UI updates optimistically.
   - Simulate network/offline failure.
   - Verify the UI snaps the task back to its original column.

Additional guardrail tests help confirm requirements are truly enforced:

- Invalid status is rejected (`VALIDATION`).
- Missing task update returns `NOT_FOUND`.
- Simultaneous moves yield exactly one success.
