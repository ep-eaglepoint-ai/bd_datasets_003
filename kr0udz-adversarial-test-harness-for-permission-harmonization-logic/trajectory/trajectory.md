# Trajectory Log

## Analysis
The problem required a black-box test harness for a permission engine. Key constraints were O(N) complexity, no external frameworks (except provided `harmonize_permissions`), and specific property verification. The tricky parts were generating adversarial updates (out-of-order, refinements w/o parents) and verifying invariants without re-implementing the engine logic (relying on audit trails).

## Strategy
1.  **Generator**: Implemented a stream-based generator. It pre-selects `(doc, user)` pairs to ensure collisions (and thus dedup/supersession/refinement logic triggering) while keeping O(N).
2.  **Verifier**:
    *   **coverage**: Set comparison of IDs.
    *   **dedup**: Track integrated signatures.
    *   **refinement/supersession**: Replay the *audit trail*. This avoids re-simulating the logic but allows verifying that the *reported* outcome matches the state transition rules (e.g., if INTEGRATED refinement, check parent existed in replayed state).
3.  **Meta-Testing**: Created broken implementations (`ignore_tier`, `ignore_refinement`, etc.) to prove the verifier catches bugs.

## Execution
1.  Created `repository_after/app.py` with `generate_updates` and `verify_invariants`.
2.  Implemented a reference `harmonize.py` (correct engine) to pass the harness.
3.  Set up Docker environment with `pytest`.
4.  Implemented meta-tests in `test_harness_meta.py`.
5.  Ran tests via Docker; all passed.
6.  Generated `diff.patch`.

## Resources
- Python `random`, `uuid`, `hashlib`.
- `pytest` for meta-testing.
