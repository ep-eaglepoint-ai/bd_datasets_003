
import os
import sys
import pytest
import subprocess

# Meta-Tests for Raft Adversarial Suite

def test_primary_test_file_exists():
    """Verify that the primary test file exists in the expected location."""
    target_repo = os.environ.get("TARGET_REPO", "repository_after")
    expected_path = os.path.join("/app", target_repo, "test_raft_chaos.py")
    assert os.path.exists(expected_path), f"Primary test file not found at {expected_path}"

def test_chaos_classes_exist():
    """Verify that the harness classes are defined."""
    target_repo = os.environ.get("TARGET_REPO", "repository_after")
    sys.path.append(os.path.join("/app", target_repo))
    try:
        from raft_chaos_harness import ChaosOrchestrator, RaftNodeProxy
    except ImportError as e:
        pytest.fail(f"Could not import harness classes from {target_repo}: {e}")

def test_primary_tests_are_discoverable():
    """
    Run pytest --collect-only on the primary test directory 
    to ensure tests are valid and discoverable.
    """
    target_repo = os.environ.get("TARGET_REPO", "repository_after")
    test_path = os.path.join("/app", target_repo, "test_raft_chaos.py")
    
    # If the file doesn't exist (e.g. in repository_before), this test fails, which is expected for 'before'
    if not os.path.exists(test_path):
        pytest.fail(f"Primary test file {test_path} does not exist")
        
    result = subprocess.run(
        ["pytest", "--collect-only", test_path],
        capture_output=True,
        text=True
    )
    assert result.returncode == 0, f"Pytest collection failed:\n{result.stderr}"
    assert "collected" in result.stdout
    # Check for the specific test function
    assert "test_raft_system_under_chaos" in result.stdout

def test_requirements_file_updated():
    with open("/app/requirements.txt", "r") as f:
        content = f.read()
    assert "pytest-asyncio" in content
