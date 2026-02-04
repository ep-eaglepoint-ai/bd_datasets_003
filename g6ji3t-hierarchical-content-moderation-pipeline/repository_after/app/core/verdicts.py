from enum import Enum


class Verdict(str, Enum):
    ALLOWED = "ALLOWED"
    FLAGGED = "FLAGGED"
    BLOCKED = "BLOCKED"


def merge_verdict(current: Verdict, incoming: Verdict) -> Verdict:
    """
    Escalation rules:
    BLOCKED > FLAGGED > ALLOWED
    """
    if incoming == Verdict.BLOCKED:
        return Verdict.BLOCKED
    if incoming == Verdict.FLAGGED and current == Verdict.ALLOWED:
        return Verdict.FLAGGED
    return current
