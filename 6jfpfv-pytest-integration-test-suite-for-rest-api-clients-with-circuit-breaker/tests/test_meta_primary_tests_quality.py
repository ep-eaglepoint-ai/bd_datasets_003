from __future__ import annotations

import ast
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parent.parent
PRIMARY_TEST_FILE = ROOT / "repository_after" / "test_clients_integration.py"


def test_primary_test_file_exists():
    assert PRIMARY_TEST_FILE.exists(), f"Missing primary test file: {PRIMARY_TEST_FILE}"


def test_primary_tests_are_pytest_discoverable():
    text = PRIMARY_TEST_FILE.read_text(encoding="utf-8")
    assert "def test_" in text or "async def test_" in text


def test_primary_tests_contain_parametrize_for_5xx_codes():
    text = PRIMARY_TEST_FILE.read_text(encoding="utf-8")
    # Requirement: Retry behavior must be tested across 500,502,503,504 via pytest.mark.parametrize.
    assert "@pytest.mark.parametrize" in text
    assert "500" in text and "502" in text and "503" in text and "504" in text


def test_primary_tests_use_respx_mocking_somewhere():
    text = PRIMARY_TEST_FILE.read_text(encoding="utf-8")
    assert "respx.mock" in text or "import respx" in text


def test_primary_tests_use_async_with_for_clients():
    text = PRIMARY_TEST_FILE.read_text(encoding="utf-8")
    # Requirement: fixtures must use async context managers.
    assert "async with UserServiceClient" in text
    assert "async with PaymentServiceClient" in text
    assert "async with NotificationServiceClient" in text


def test_no_unintentional_skips_in_primary_tests():
    tree = ast.parse(PRIMARY_TEST_FILE.read_text(encoding="utf-8"))
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            if node.func.attr in {"skip", "skipif", "xfail"}:
                pytest.fail("Primary tests should not contain skip/xfail markers")
