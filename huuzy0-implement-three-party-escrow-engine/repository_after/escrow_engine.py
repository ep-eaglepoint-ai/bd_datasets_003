from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Literal

State = Literal["INIT", "FUNDED", "COMPLETED", "DISPUTE_RESOLVED", "CANCELLED"]


class StateError(RuntimeError):
    """Raised when an operation is attempted in an invalid state."""


@dataclass(frozen=True)
class _Distribution:
    buyer: int
    seller: int
    agent: int


class EscrowEngine:
    """Deterministic FSM for a single 3-party escrow contract.

    Ledger model: balances represent allocated funds held for each actor plus escrow.
    Funding invariant: sum(balances) == total_required (only true once fully funded).
    """

    def __init__(self, price: int, agent_fee: int):
        if not isinstance(price, int) or not isinstance(agent_fee, int):
            raise TypeError("price and agent_fee must be integers")
        if price < 0 or agent_fee < 0:
            raise ValueError("price and agent_fee must be non-negative")

        self.price = price
        self.agent_fee = agent_fee
        self.total_required = price + agent_fee

        self.total_deposited = 0

        self.balances: Dict[str, int] = {
            "buyer": 0,
            "seller": 0,
            "agent": 0,
            "escrow": 0,
        }
        self.state: State = "INIT"

    def deposit(self, amount: int) -> bool:
        """Accepts funds into escrow.

        Returns False for under/over funding without mutating state.
        Transitions to FUNDED only when amount equals total_required.
        """

        if self.state != "INIT":
            raise StateError(f"deposit not allowed in state {self.state}")
        if not isinstance(amount, int):
            raise TypeError("amount must be an integer")
        if amount < 0:
            raise ValueError("amount must be non-negative")

        if amount != self.total_required:
            return False

        new_balances = dict(self.balances)
        new_balances["escrow"] = amount

        self.balances = new_balances
        self.total_deposited = amount
        self.state = "FUNDED"

        return True

    def release_funds(self) -> Dict[str, int]:
        """Normal completion flow.

        Distributes price to seller and fee to agent; empties escrow.
        """

        if self.state != "FUNDED":
            raise StateError(f"release_funds not allowed in state {self.state}")
        if self.balances["escrow"] != self.total_required:
            raise RuntimeError("corrupt ledger: escrow balance does not equal total_required")

        new_balances = dict(self.balances)
        new_balances["escrow"] = 0
        new_balances["seller"] += self.price
        new_balances["agent"] += self.agent_fee

        if any(v < 0 for v in new_balances.values()):
            raise RuntimeError("internal error: negative balance computed")

        self.balances = new_balances
        self.state = "COMPLETED"

        return dict(self.balances)

    def resolve_dispute(self, refund_amount_to_buyer: int) -> Dict[str, int]:
        """Dispute resolution with agent fee absorption.

        Rules:
        - refund <= price: seller absorbs refund (seller gets price - refund), agent keeps full fee.
        - refund > price: seller gets 0, agent fee covers (refund - price) up to agent_fee.
        - refund cannot exceed total_required.
        """

        if self.state != "FUNDED":
            raise StateError(f"resolve_dispute not allowed in state {self.state}")
        if not isinstance(refund_amount_to_buyer, int):
            raise TypeError("refund_amount_to_buyer must be an integer")
        if refund_amount_to_buyer < 0:
            raise ValueError("refund_amount_to_buyer must be non-negative")
        if refund_amount_to_buyer > self.total_required:
            raise ValueError("refund_amount_to_buyer cannot exceed total deposited")
        if self.balances["escrow"] != self.total_required:
            raise RuntimeError("corrupt ledger: escrow balance does not equal total_required")

        distribution = self._compute_dispute_distribution(refund_amount_to_buyer)

        new_balances = dict(self.balances)
        new_balances["escrow"] = 0
        new_balances["buyer"] += distribution.buyer
        new_balances["seller"] += distribution.seller
        new_balances["agent"] += distribution.agent

        if any(v < 0 for v in new_balances.values()):
            raise RuntimeError("internal error: negative balance computed")

        self.balances = new_balances
        self.state = "DISPUTE_RESOLVED"

        return dict(self.balances)

    def _compute_dispute_distribution(self, refund_amount_to_buyer: int) -> _Distribution:
        if refund_amount_to_buyer <= self.price:
            buyer = refund_amount_to_buyer
            seller = self.price - refund_amount_to_buyer
            agent = self.agent_fee
        else:
            buyer = refund_amount_to_buyer
            seller = 0
            overage = refund_amount_to_buyer - self.price
            if overage > self.agent_fee:
                raise ValueError("refund requires more than seller+agent funds")
            agent = self.agent_fee - overage

        if buyer < 0 or seller < 0 or agent < 0:
            raise RuntimeError("internal error: negative distribution")
        if buyer + seller + agent != self.total_required:
            raise RuntimeError("internal error: distribution violates conservation")

        return _Distribution(buyer=buyer, seller=seller, agent=agent)

    def get_ledger_invariant(self) -> bool:
        """True iff sum(balances) equals total_required.

        this is intentionally not a generic conservation check.
        It is only expected to be True when the escrow has been fully funded.
        """

        return sum(self.balances.values()) == self.total_required
