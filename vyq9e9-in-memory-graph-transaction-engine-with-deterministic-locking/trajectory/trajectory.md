# Trajectory: In-Memory Graph Transaction Engine with Deterministic Locking

1. Audit / Requirements Analysis (The actual problem)

I went through the transaction engine and the spec and saw that it was supposed to support concurrent transactions over a graph of nodes (accounts/wallets) with Begin, Read, Write, and Commit. The problem was that a naive implementation would either use one big lock for the whole commit (which kills concurrency) or lock nodes in arbitrary order (which can deadlock when two transactions touch the same nodes in different orders). So the real issue was: how do we get fine-grained locking without deadlocks and without leaking uncommitted writes?

2. Question Assumptions (Challenge the Premise)

At first I assumed we had to lock the whole graph during commit to keep things simple. But that doesn’t scale. I stepped back and asked: what’s the minimum we need? We only need to lock the nodes that a transaction actually writes to, and if everyone agrees on a fixed order (e.g. sort node IDs), then no two transactions can form a cycle waiting on each other. So the fix is per-node locks plus a deterministic lock order.

3. Define Success Criteria (Establish Measurable Goals)

I spelled out what “done” means: the file is transaction_manager.go; each Node has its own sync.RWMutex; Commit does not use a single global mutex for the whole commit; Commit sorts the list of node IDs before taking locks; Write only updates a local buffer until Commit; global state is updated only after all locks are held; we check balance >= 0 before applying; if validation fails we release locks and return an error; lock release is done with defer so we don’t leave locks held on panic; and we pass a stress test with 100+ concurrent transactions swapping between two nodes without hanging.

4. Map Requirements to Validation (Define Test Strategy)

I aligned the tests with those requirements. There are unit-style checks (e.g. Node has RWMutex, Commit has sort.Strings, no single Lock around the whole commit, defer Unlock in Commit) and behavior checks (Write doesn’t leak to global state, Commit applies only after locks and validation, negative balance is rejected, next transaction can commit after a validation failure, stress test with many goroutines). The tests are written so they fail on the old “one big lock” or “no sort” implementation and pass on the correct one.

5. Scope the Solution

I limited the change to the transaction manager: keep the same public API (Begin, Read, Write, Commit), add a per-node RWMutex on Node, keep a local write set on the transaction, and in Commit: collect write-set node IDs, sort them, acquire each node’s lock in that order with defer Unlock, validate (e.g. non-negative balance), then apply the deltas. No new packages or external deps. Tests and evaluation run only against the implementation in repository_after.

6. Trace Data Flow (Follow the Path)

Before: Commit could take one global lock and do all updates under it, or lock nodes in whatever order the map iteration gave, which can deadlock. After: Begin returns a transaction with an empty write set. Read uses the manager’s read lock briefly to resolve the node, then the node’s RLock to read balance, and adds the transaction’s own write-set delta so the read is consistent. Write only updates the transaction’s writeSet. Commit collects IDs from the write set, sorts them, grabs each node’s lock in that order (with defer Unlock), validates, then applies. So the path is: local buffer during the transaction, then sorted lock acquisition, then validate, then write to global state.

7. Anticipate Objections (Play Devil’s Advocate)

One concern: “Sorting and locking many nodes could be slow.” But we only lock the nodes we touch, and the sort is over a small set (the write set). Another: “What if we need to add nodes while committing?” We resolve node pointers under the manager’s read lock before we start acquiring per-node locks, so the set of nodes we lock is fixed for that commit. And if validation fails we return an error and the defers release all locks we took, so we don’t leave the system locked.

8. Verify Invariants (Define Constraints)

I made sure we don’t change the contract: Read/Write/Commit semantics are the same from the caller’s view. Node still has ID and Balance; we only added the mutex. Write still only records a delta; it must not touch global node state. We still enforce balance >= 0 and we still release locks on validation failure. Defer is used for every Unlock so panics don’t leave locks held.

9. Execute with Surgical Precision (Ordered Implementation)

I implemented it in a clear sequence. (1) Add sync.RWMutex to Node. (2) Keep the Transaction’s writeSet as the only place Write mutates. (3) In Commit: build the list of node IDs from the write set, sort with sort.Strings, hold the manager’s RLock only long enough to resolve node pointers into a slice, then release it. (4) Loop over that slice in order, Lock each node and defer Unlock. (5) Build a small map from ID to node for the write set. (6) Validate: for each write-set entry compute new balance and if any would be negative return an error (defers already run and release locks). (7) Apply each delta to the corresponding node’s Balance. (8) Return nil so defers run and release all locks.

10. Measure Impact (Verify Completion)

I ran the test suite and the evaluation. All 12 requirement tests pass, including the stress test with 150 concurrent transactions swapping between two nodes. No deadlocks, and the final balances match the expected totals. The implementation in repository_after is the one under test.

11. Document the Decision

The design is: fine-grained locking per node, deterministic lock order by sorting node IDs before acquiring locks, local write buffer until commit, validation before applying, and defer for every Unlock. That gives concurrency without deadlock and keeps the API and invariants the same. This matches the usual approach for in-memory transaction engines that need deterministic locking.

12. Post-implementation: QA, tooling, and fixes

Tests were refactored into per-requirement files (test_for_req01_* through test_for_req12_* in tests/) plus test_util_test.go for shared types, getManager, getRepoPath, readRepoSource, and TestMain. Requirements were mapped to test cases and tests were strengthened: Req2 rejects sync.Mutex (only RWMutex); Req3 requires per-node lock and rejects global commit mutex (tx.tm.mu.Lock/defer Unlock in Commit); Req4 requires sort inside Commit and lock acquisition after sort in source; Req5 uses two nodes for buffer isolation; Req6 adds a source check that Balance update is after lock acquisition; Req7 adds a multi-node negative case (M=-15, N=+10 so M would go to -5; commit must fail and state unchanged); Req9 requires defer and per-node Unlock in Commit; Req11 writes in non-sorted order (C, B, A) to assert deterministic handling; Req12 adds a read-only transaction (Begin, Read, Commit) that must succeed. Tests and evaluation run only against repository_after. For Docker on Windows/Git Bash, -w /app/tests was mangled to a bad path, so go.work was added at project root (use ./tests, ./evaluation, ./repository_after) so that go test -v ./tests and go run ./evaluation/evaluation.go work from /app without -w. README docker commands use no quotes and no -w. .gitignore was updated for Go build artifacts, evaluation report dirs, IDE/OS/debug logs, and env files. TestReq07 multi-node scenario was corrected: the original M=-5 N=+5 with M=10 N=0 leaves both balances non-negative (5 and 5), so the implementation correctly allowed the commit; the test was changed to M=-15 N=+10 so M would become -5 and the commit must fail.
