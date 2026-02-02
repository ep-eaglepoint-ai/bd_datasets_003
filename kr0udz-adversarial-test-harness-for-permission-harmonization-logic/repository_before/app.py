from typing import Dict, List


def generate_updates(seed: int, n: int, m_docs: int, k_users: int) -> list[dict]:
    """
    Generate adversarial-but-valid permission update fragments.

    Requirements:
    - Deterministic based on seed
    - O(n) time and O(n) space
    - Must include duplicates, refinements-before-parents,
      authority conflicts, and late-arriving lower-tier updates
    """
    raise NotImplementedError


def run_harness(harmonize_permissions, seed: int, n: int, m_docs: int, k_users: int) -> dict:
    """
    Orchestrates the test run:
    - Generates updates
    - Creates a vault snapshot
    - Calls harmonize_permissions(vault, updates)
    - Verifies invariants
    - Returns a summary dict
    """
    raise NotImplementedError


def verify_invariants(
    vault_before: dict,
    updates: list[dict],
    vault_after: dict,
    report: dict
) -> None:
    """
    Verifies logical invariants without re-implementing the harmonization logic.

    Must raise AssertionError on first failure.
    Must run in O(n) time.
    Must not rely on exact error-message strings or a fixed vault schema.
    """
    raise NotImplementedError
