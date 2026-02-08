from __future__ import annotations

import copy
import os
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
REPO_NAME = os.environ.get("EVAL_REPO", "repository_after")
REPO_PATH = REPO_ROOT / REPO_NAME
sys.path.insert(0, str(REPO_PATH))

from escrow_engine import EscrowEngine, StateError


def test_invariant_false_before_deposit() -> None:
    e = EscrowEngine(price=100, agent_fee=10)
    assert e.state == "INIT"
    assert e.total_required == 110
    assert e.get_ledger_invariant() is False


def test_deposit_enforces_exact_amount_and_transitions_to_funded() -> None:
    e = EscrowEngine(price=100, agent_fee=10)

    snapshot = copy.deepcopy(e.balances)
    assert e.deposit(109) is False
    assert e.state == "INIT"
    assert e.balances == snapshot
    assert e.get_ledger_invariant() is False

    snapshot = copy.deepcopy(e.balances)
    assert e.deposit(111) is False
    assert e.state == "INIT"
    assert e.balances == snapshot
    assert e.get_ledger_invariant() is False

    assert e.deposit(110) is True
    assert e.state == "FUNDED"
    assert e.balances["escrow"] == 110
    assert e.get_ledger_invariant() is True


def test_deposit_invalid_state_raises_state_error() -> None:
    e = EscrowEngine(price=100, agent_fee=10)
    assert e.deposit(110) is True

    with pytest.raises(StateError):
        e.deposit(110)


def test_release_funds_requires_funded_and_distributes_correctly() -> None:
    e = EscrowEngine(price=100, agent_fee=10)

    with pytest.raises(StateError):
        e.release_funds()

    assert e.deposit(110) is True

    out = e.release_funds()
    assert e.state == "COMPLETED"
    assert out["escrow"] == 0
    assert out["seller"] == 100
    assert out["agent"] == 10
    assert out["buyer"] == 0
    assert e.get_ledger_invariant() is True


def test_methods_return_committed_ledger_snapshot() -> None:
    e = EscrowEngine(price=100, agent_fee=10)
    assert e.deposit(110) is True

    out_release = e.release_funds()
    assert out_release == e.balances

    e2 = EscrowEngine(price=100, agent_fee=10)
    assert e2.deposit(110) is True
    out_dispute = e2.resolve_dispute(105)
    assert out_dispute == e2.balances


@pytest.mark.parametrize(
    "refund",
    [0, 1, 50, 100],
)
def test_resolve_dispute_refund_leq_price_seller_absorbs(refund: int) -> None:
    e = EscrowEngine(price=100, agent_fee=10)

    with pytest.raises(StateError):
        e.resolve_dispute(refund)

    assert e.deposit(110) is True
    out = e.resolve_dispute(refund)

    assert e.state == "DISPUTE_RESOLVED"
    assert out["escrow"] == 0
    assert out["buyer"] == refund
    assert out["seller"] == 100 - refund
    assert out["agent"] == 10

    assert out["buyer"] >= 0
    assert out["seller"] >= 0
    assert out["agent"] >= 0
    assert e.get_ledger_invariant() is True


@pytest.mark.parametrize(
    "refund,expected_agent",
    [
        (101, 9),
        (105, 5),
        (110, 0),
    ],
)
def test_resolve_dispute_refund_gt_price_agent_fee_covers_overage(refund: int, expected_agent: int) -> None:
    e = EscrowEngine(price=100, agent_fee=10)
    assert e.deposit(110) is True

    out = e.resolve_dispute(refund)

    assert e.state == "DISPUTE_RESOLVED"
    assert out["escrow"] == 0
    assert out["buyer"] == refund
    assert out["seller"] == 0
    assert out["agent"] == expected_agent

    assert out["agent"] >= 0
    assert e.get_ledger_invariant() is True


def test_adversarial_refund_more_than_total_required_rejected_and_state_not_corrupted() -> None:
    e = EscrowEngine(price=100, agent_fee=10)
    assert e.deposit(110) is True

    balances_before = copy.deepcopy(e.balances)
    state_before = e.state
    total_deposited_before = e.total_deposited

    with pytest.raises(ValueError):
        e.resolve_dispute(111)

    assert e.state == state_before
    assert e.balances == balances_before
    assert e.total_deposited == total_deposited_before
    assert e.get_ledger_invariant() is True


def test_get_ledger_invariant_detects_tampering() -> None:
    e = EscrowEngine(price=100, agent_fee=10)
    assert e.get_ledger_invariant() is False

    e.balances["escrow"] = 1
    assert e.get_ledger_invariant() is False
