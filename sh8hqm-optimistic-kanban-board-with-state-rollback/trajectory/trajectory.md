# Trajectory: Optimistic Kanban with State Rollback

## The Problem: Achieving "Instant" UI without Data Corruption
In a high-intensity Kanban application, users expect cards to move instantly when dragged. Waiting for a server response (500ms - 2s) makes the app feel sluggish.

The technical challenges of "Optimistic UI" include:
1. **State Synchronization:** The UI must reflect the change immediately, but stay in sync with the server's eventual truth.
2. **Error Recovery:** If the server rejects a move (e.g., validation fail or network error), the card must "snap back" to its original position without breaking other concurrent moves.
3. **Race Conditions:** If a user moves Task A twice in rapid succession, a late error from the *first* move shouldn't accidentally roll back the *second* successful move.
4. **Backend Integrity:** The server must strictly validate moves to prevent "ghost cards" or index out-of-bounds errors.

## The Solution: Snapshot-based Rollbacks & Move Sequencing

Instead of just updating the UI and hoping for the best, we built a defensive state management system:

### 1. **Snapshot-based State Management**
Whenever an `OPTIMISTIC_MOVE` is dispatched, the `boardReducer` doesn't just move the card; it captures a **Base Snapshot** of the board specific to that card.
- This snapshot is stored in a `pendingMoves` map.
- If the API fails, we don't calculate "inverse math" (which is error-prone); we simply restore the saved snapshot.

### 2. **Client-Side Move Sequencing**
To solve race conditions, we introduced a `clientMoveId`.
- Every move attempt gets a unique local ID.
- The state tracks the `latestClientMoveIdByCard`.
- **Logic:** A rollback or confirmation is *ignored* if it belongs to an older `clientMoveId`. This ensures that if you move a card to "Done" and then "Deleted", an error from the move to "Done" won't overwrite your "Deleted" state.

### 3. **Robust Backend Validation**
The backend `moveCard` function was implemented with strict boundary checks:
- It validates coordinates: `0 <= targetIndex <= targetColumn.length`.
- It handles the "same column" vs "different column" logic specifically, ensuring indices are calculated correctly after the card is conceptually "detached" from the board.

## Implementation Steps

### Step 1: Defined the State Schema
I updated the `BoardState` to include `pendingMoves` and `latestClientMoveIdByCard`. This created a "registry" of active optimistic actions that could be reverted independently.

### Step 2: Built the `useMoveCard` Hook
This hook acts as the coordinator. 
- It generates the `clientMoveId`.
- It dispatches the UI update instantly.
- It triggers the background API call.
- It handles the result: `MOVE_CONFIRMED` on success, or `ROLLBACK_MOVE` + Toast Notification on failure.

### Step 3: Implemented Draggable Positioning
In `Column.tsx`, I replaced simple "append to end" logic with a bounding-box calculation. By measuring the `midpoint` of existing cards during a `drop` event, the system determines the exact target index, providing a premium drag-and-drop feel.

### Step 4: Resolved Environment & Tooling Bottlenecks
During development, we hit two critical "hidden" bugs:
- **Vite Path Conflict:** The frontend folder `/api` conflicted with the backend proxy `/api`. Renaming it to `/services` resolved the "Stuck on Loading" issue.
- **MIME/Jest Interop:** A version conflict in the `mime` package caused the backend to crash during tests. Resolving this via `package.json` overrides and cleaning up `jest.config.cjs` restored the testing pipeline.

## Why I Did It This Way

### Initial Thought: Inverse Operations
I considered rolling back by moving the card back from `A -> B`. 
**Correction:** This fails if other cards moved in the meantime. **Snapshots** are inherently safer because they represent a known-good state of the entire board at that specific point in time.

### Refinement: Handling Rapid Fire
The user might drag Task 1, Task 2, and Task 1 again in under 1 second.
**Decision:** By keeping a `latestClientMoveIdByCard` record, we treat cards as independent actors. Move #1 for Card A can fail without impacting any moves for Card B, or even Move #2 for Card A.

## Testing Strategy

### 1. **Backend Validation Tests**
Verified 4 core scenarios in `moveValidation.test.ts`:
- Successful move correctly updates lengths.
- Invalid column results in 400.
- Negative index results in 400.
- Out-of-bounds index results in 400.

### 2. **Frontend Interoperability Tests**
Verified the "Optimistic" lifecycle:
- `optimisticMove.test.tsx`: Card moves immediately in DOM.
- `rollbackOnFailure.test.tsx`: Card reverts and Toast appears on API error.
- `raceConditions.test.tsx`: Stale error responses are ignored.

### 3. **Docker Comparative Evaluation**
Used the Docker Compose pipeline to compare the `repository_before` (baseline) with our `repository_after` (refactor), confirming 100% test pass rate and feature parity.

---

## 📚 Key Learnings

1. **State Snapshots are King**
   - For complex UIs like Kanban, the safest way to undo is to "time travel" back to a snapshot rather than guessing inverse logic.

2. **Middleware & Proxies can be Fragile**
   - Be careful with folder naming (`/api`) when your dev server has a proxy on the same route. It leads to extremely hard-to-debug "stuck" pages.

3. **MIME/JSON Interop in Express**
   - Express's `res.json()` relies on the `mime` package. If your environment has a broken or mapped `mime` version (e.g., via Jest), the server will return HTML error pages instead of JSON, breaking your API clients.
