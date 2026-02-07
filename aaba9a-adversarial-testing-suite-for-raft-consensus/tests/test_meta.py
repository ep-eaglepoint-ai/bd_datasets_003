
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

def test_requirements_implementation_assertions():
    """
    Statically analyze the test file to ensure it checks for key requirements like Liveness, Safety, etc.
    """
    target_repo = os.environ.get("TARGET_REPO", "repository_after")
    test_path = os.path.join("/app", target_repo, "test_raft_chaos.py")
    
    if not os.path.exists(test_path):
         pytest.skip("Test file not found")
         
    with open(test_path, "r") as f:
        content = f.read()
        
    # Req 1: Partitions
    assert "partition_from" in content, "Req 1: 'partition_from' missing"
    assert "create_bridge_partition" in content, "Req 1: 'create_bridge_partition' missing"
    assert "create_cyclic_partition" in content, "Req 1: 'create_cyclic_partition' missing"
    
    # Req 2: Concurrent Clients
    assert "asyncio.create_task" in content, "Req 2: 'asyncio.create_task' missing"
    
    # Req 3: Safety Assertions (Linearizability)
    assert "verify_linearizability" in content, "Req 3: 'verify_linearizability' missing"
    
    # Req 4: Liveness (Timeout recovery)
    assert "asyncio.wait_for" in content, "Req 4: 'asyncio.wait_for' missing for timeout"
    assert "timeout=5.0" in content, "Req 4: 'timeout=5.0' missing"
    
    # Req 5: Term Monotonicity
    assert "assert t >= previous_terms" in content or "Term Regression" in content, "Req 5: Monotonicity assertion missing"
    
    # Req 6: Post-Chaos Consistency
    assert "test_key = \"consistency_check\"" in content or "final_val" in content, "Req 6: proper consistency check missing"
    
    # Req 7: Fault Interleaving
    # Hard to regex strictly for logic flow, but verify orchestrator injection usage
    assert "orchestrator.inject_" in content or "orchestrator.apply_" in content, "Req 7: Fault injection calls missing"

    # Req 8: Parametrization
    assert "@pytest.mark.parametrize" in content, "Req 8: Parametrization missing"
