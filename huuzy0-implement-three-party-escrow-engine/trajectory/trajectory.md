# Trajectory

## 1. Problem Breakdown

Feature must do:
- Implement a deterministic escrow state machine for Buyer/Seller/Agent.
- Enforce exact funding: deposit only succeeds when `amount == price + agent_fee`.
- Allow normal completion: pay `price` to Seller and `agent_fee` to Agent.
- Allow dispute resolution with fee absorption:
	- If refund $\le price$, Seller absorbs the refund.
	- If refund $> price$, Seller gets $0$ and Agent fee covers the extra up to `agent_fee`.
- Prevent invalid state transitions using a custom `StateError`.
- Preserve money conservation: no money created/destroyed; balances sum equals deposited amount.
- Provide tests that cover all rules and an adversarial case.

Edge cases handled:
- Under-funding / over-funding deposits.
- Calling `release_funds` / `resolve_dispute` in the wrong state.
- Refund of `0`, refund equal to `price`, refund equal to `price + agent_fee`.
- Refund greater than `price + agent_fee` (must be rejected without changing state).
- Negative inputs and non-integer inputs.

## 2. Solution Reasoning

I considered modeling a full double-entry ledger (buyer debited, escrow credited), but rejected it because the provided skeleton and requirements focus on allocations and a simple global conservation invariant rather than account liabilities.

I chose a minimal deterministic FSM:
- Keep an `escrow` balance that holds the deposit.
- On terminal actions (release/dispute), atomically set `escrow` to `0` and allocate funds to `buyer/seller/agent`.
- Track `total_deposited` (0 before deposit; equals `total_required` after deposit) so the invariant is meaningful in all states.

Complexity:
- All operations are O(1) time and O(1) space because they only do constant-size arithmetic and dictionary updates.

## 3. Building It

Code organization:
- Implemented `EscrowEngine` in `repository_after/escrow_engine.py`.
- Added `StateError` for invalid transitions.

Main behaviors:
- `deposit(amount)`:
	- Allowed only in `INIT`.
	- Returns `False` (no mutation) if `amount != total_required`.
	- On success: sets `escrow = amount`, sets `total_deposited`, transitions to `FUNDED`.
- `release_funds()`:
	- Allowed only in `FUNDED`.
	- Moves funds out of escrow: seller gets `price`, agent gets `agent_fee`, escrow becomes `0`.
	- Transitions to `COMPLETED`.
- `resolve_dispute(refund)`:
	- Allowed only in `FUNDED`.
	- Rejects `refund > total_required`.
	- Computes deterministic distribution ensuring `buyer + seller + agent == total_required`.
	- Transitions to `DISPUTE_RESOLVED`.

Atomicity:
- Each operation computes `new_balances` first, validates it (no negatives), then commits to `self.balances` and updates state.

Randomness:
- None used; all computations are purely deterministic integer math.

## 4. Testing

Test types:
- Happy-path tests: exact deposit, release funds, multiple dispute scenarios.
- Edge-case tests: refund boundaries (0, price, total_required).
- State machine tests: invalid transitions raise `StateError`.
- Adversarial test: refund greater than total_required must raise and must not mutate balances or state.

Cheating/lazy-solution checks:
- The adversarial test verifies state immutability on failure (prevents “silent partial updates”).
- A tampering test confirms `get_ledger_invariant()` actually checks sums, not hard-coded `True`.

## 5. Key Decisions

Assumptions:
- Balances represent allocations, not liabilities; deposit credits escrow only.
- Dispute resolution must always distribute exactly the deposited total.

Why no extra libraries:
- Only `pytest` is added for tests; core logic uses standard library only.

Hardest part:
- Getting the dispute cascade correct while guaranteeing conservation and non-negative balances; solved by computing a distribution that always sums to `total_required` and validating it before committing.

## 6. Final Check
Manual verification:
- Ran pytest in Docker with `PYTHONPATH` pointing at `repository_after`.

Requirement mapping:
- Exact funding: `deposit()` rejects non-exact amounts and only transitions to `FUNDED` on exact funding.
- Dispute cascade: implemented per rules and validated via parameterized tests.
- Strict transitions: `StateError` raised on invalid transitions.
- Integer-only arithmetic: all amounts validated as ints; no floats used.
- Invariant: `get_ledger_invariant()` checks sum(balances) equals `total_deposited`.
- Adversarial test: refund > total_required raises and does not mutate state.

## 7. Special Note

Starting from empty folder - all code is new in `repository_after`.

