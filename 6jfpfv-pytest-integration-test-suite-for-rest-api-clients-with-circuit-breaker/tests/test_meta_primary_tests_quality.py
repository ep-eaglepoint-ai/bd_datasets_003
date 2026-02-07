from __future__ import annotations

import ast
import os
import subprocess
import sys
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parent.parent
PRIMARY_TEST_FILE = ROOT / "repository_after" / "test_clients_integration.py"


def _primary_text() -> str:
    return PRIMARY_TEST_FILE.read_text(encoding="utf-8")


def _primary_tree() -> ast.AST:
    return ast.parse(_primary_text())


def test_primary_test_file_exists():
    assert PRIMARY_TEST_FILE.exists(), f"Missing primary test file: {PRIMARY_TEST_FILE}"


def test_primary_tests_define_many_tests():
    tree = _primary_tree()
    tests = [n.name for n in ast.walk(tree) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name.startswith("test_")]
    assert len(tests) >= 10, "Primary suite should contain a meaningful number of tests"


def test_primary_tests_contain_parametrize_for_5xx_codes_and_it_is_used_by_a_test():
    tree = _primary_tree()

    # Find a test function decorated with pytest.mark.parametrize containing the required codes.
    required = {"500", "502", "503", "504"}
    found = False
    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        if not node.name.startswith("test_"):
            continue
        for deco in node.decorator_list:
            if not isinstance(deco, ast.Call):
                continue
            if not (isinstance(deco.func, ast.Attribute) and deco.func.attr == "parametrize"):
                continue
            # Very small AST check: search for the required literals in the decorator.
            literals = {str(c.value) for c in ast.walk(deco) if isinstance(c, ast.Constant) and isinstance(c.value, int)}
            if required.issubset(literals):
                found = True
                break
        if found:
            break

    assert found, "Expected a parametrized test covering 500/502/503/504"


def test_primary_tests_use_respx_only_for_http_mocking():
    text = _primary_text()
    assert "import respx" in text
    assert "respx.mock" in text
    # Guardrail: ensure no other common HTTP mocking libs appear.
    forbidden = ["requests_mock", "responses", "aioresponses", "httpretty"]
    assert not any(x in text for x in forbidden)


def test_primary_fixtures_are_present_for_valid_and_invalid_payloads():
    text = _primary_text()
    # Reviewer requirement: fixtures for valid/invalid payloads.
    assert "def user_payload_valid" in text
    assert "def user_payload_missing_required_field" in text
    assert "def user_payload_wrong_type" in text
    assert "def payment_payload_valid" in text
    assert "def payment_payload_missing_required_field" in text
    assert "def payment_payload_wrong_type" in text
    assert "def notification_payload_valid" in text
    assert "def notification_payload_missing_required_field" in text
    assert "def notification_payload_wrong_type" in text


def test_primary_includes_invalid_schema_tests_for_payment_and_notification():
    text = _primary_text()
    assert "test_payment_get_payment_invalid_schema_missing_field" in text
    assert "test_payment_get_payment_invalid_schema_wrong_type" in text
    assert "test_notification_get_notification_invalid_schema_missing_field" in text
    assert "test_notification_get_notification_invalid_schema_wrong_type" in text


def test_no_unintentional_skips_in_primary_tests():
    tree = _primary_tree()
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            if node.func.attr in {"skip", "skipif", "xfail"}:
                pytest.fail("Primary tests should not contain skip/xfail markers")


def test_primary_suite_does_not_touch_real_network(monkeypatch: pytest.MonkeyPatch):
    """Behavioral check: run the primary suite with outbound networking *disabled*.

    Reviewer note: monkeypatch doesn't affect a subprocess.
    We instead set env vars that pytest-socket understands to fully disable sockets,
    and we also force HTTPX to avoid env proxies.
    """

    env = dict(os.environ)
    # pytest-socket is a dev dependency in this kata; disable sockets at the OS level.
    env["PYTEST_DISABLE_SOCKET"] = "1"
    env["PYTEST_SOCKET_ALLOW_HOSTS"] = ""
    # Ensure httpx doesn't read proxy vars that might cause unexpected connections.
    env["NO_PROXY"] = "*"

    proc = subprocess.run(
        [sys.executable, "-m", "pytest", "-q", "repository_after/test_clients_integration.py"],
        cwd=ROOT,
        env=env,
        capture_output=True,
        text=True,
        timeout=180,
    )
    assert proc.returncode == 0, proc.stdout + "\n" + proc.stderr


def test_fixtures_are_schema_validated_in_primary_suite():
    """Req 15(b): ensure fixture payloads actually validate against Pydantic models."""

    text = _primary_text()
    required_asserts = [
        "User.model_validate(user_payload_valid)",
        "Payment.model_validate(payment_payload_valid)",
        "Notification.model_validate(notification_payload_valid)",
    ]
    for needle in required_asserts:
        assert needle in text, f"Primary suite should schema-validate fixtures; missing: {needle}"


def test_parametrize_sets_actually_execute_all_cases():
    """Req 15(d): confirm 500/502/503/504 parametrization runs all cases.

    We execute only that test (by name) and assert it reports 4 passed.
    """

    proc = subprocess.run(
        [
            sys.executable,
            "-m",
            "pytest",
            "-q",
            "repository_after/test_clients_integration.py",
            "-k",
            "retry_triggers_for_retryable_5xx",
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=180,
    )
    assert proc.returncode == 0, proc.stdout + "\n" + proc.stderr
    # Example output: "....                                                                     [100%]\n4 passed in ..."
    assert "4 passed" in proc.stdout, proc.stdout + "\n" + proc.stderr


def test_circuit_breaker_state_isolation_is_enforced_by_fixtures():
    """Req 15(c): ensure circuit breaker state doesn't leak across tests.

    We run the circuit breaker tests only; they must pass when run together.
    """

    proc = subprocess.run(
        [
            sys.executable,
            "-m",
            "pytest",
            "-q",
            "repository_after/test_clients_integration.py",
            "-k",
            "circuit_breaker_opens_after_consecutive_failures or circuit_breaker_recovers_open_to_half_open_to_closed",
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=180,
    )
    assert proc.returncode == 0, proc.stdout + "\n" + proc.stderr
