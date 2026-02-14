import pytest
import sys
import os

# Ensure we can import from repository_after
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from repository_after.app import run_harness
from repository_after.harmonize import harmonize_permissions as correct_impl

from tests.resources.ignore_tier import harmonize_permissions as broken_tier
from tests.resources.ignore_refinement import harmonize_permissions as broken_refinement
from tests.resources.ignore_dedup import harmonize_permissions as broken_dedup
from tests.resources.drop_updates import harmonize_permissions as broken_drop

PARAMS = {
    "seed": 42,
    "n": 50,
    "m_docs": 5,
    "k_users": 5
}

def test_correct_implementation_passes():
    result = run_harness(correct_impl, **PARAMS)
    assert result["status"] == "PASSED", f"Correct implementation failed: {result['error']}"

def test_broken_tier_fails():
    result = run_harness(broken_tier, **PARAMS)
    assert result["status"] == "FAILED", "Broken tier implementation should have failed"
    # Optional: check error message contains relevant keywords like "SUPERSEDED" or "tier" or "final state"
    
def test_broken_refinement_fails():
    result = run_harness(broken_refinement, **PARAMS)
    assert result["status"] == "FAILED", "Broken refinement implementation should have failed"
    # Optional: check for "refinement" error

def test_broken_dedup_fails():
    result = run_harness(broken_dedup, **PARAMS)
    assert result["status"] == "FAILED", "Broken dedup implementation should have failed"
    # Check for "Duplicate signature"
    
def test_broken_drop_fails():
    result = run_harness(broken_drop, **PARAMS)
    assert result["status"] == "FAILED", "Broken drop implementation should have failed"
    # Check for "Classification validation"
