#!/usr/bin/env python3
"""
Evaluation script for Fiscal Precision Engine test suite.
Runs tests against repository_before and repository_after, then generates a comparison report.
"""
import subprocess
import sys
import json
import os
import platform
import uuid
from pathlib import Path
from datetime import datetime

ROOT = Path("/app")
REPORTS_DIR = ROOT / "evaluation" / "reports"

# Ensure reports directory exists
REPORTS_DIR.mkdir(parents=True, exist_ok=True)


def get_environment_info():
    """Get system environment information."""
    return {
        "python_version": sys.version.split()[0],
        "platform": platform.platform(),
        "arch": platform.machine(),
        "cpus": os.cpu_count(),
    }


def run_tests(repo_path):
    """
    Runs pytest test suite for a specific repository path.
    Returns dict with passed, return_code, and output.
    """
    repo_full_path = ROOT / repo_path
    
    if not repo_full_path.exists():
        return {
            "passed": False,
            "return_code": 1,
            "output": f"Repository path {repo_path} does not exist"
        }
    
    # Run pytest with explicit path
    result = subprocess.run(
        ["pytest", ".", "-v", "--tb=short"],
        cwd=repo_full_path,
        capture_output=True,
        text=True
    )
    
    passed = result.returncode == 0
    output = result.stdout + result.stderr
    
    return {
        "passed": passed,
        "return_code": result.returncode,
        "output": output[:500] if len(output) > 500 else output  # Truncate if too long
    }


def run_tests_with_coverage(repo_path):
    """
    Runs pytest with coverage for repository_after.
    Returns tuple of (test_result_dict, coverage_percent).
    """
    repo_full_path = ROOT / repo_path
    
    if not repo_full_path.exists():
        return {
            "passed": False,
            "return_code": 1,
            "output": f"Repository path {repo_path} does not exist"
        }, None
    
    # Run pytest with coverage and explicit path
    result = subprocess.run(
        [
            "pytest",
            ".",
            "--cov=fiscal_engine",
            "--cov-report=json:coverage.json",
            "--cov-report=term",
            "-v",
            "--tb=short"
        ],
        cwd=repo_full_path,
        capture_output=True,
        text=True
    )
    
    passed = result.returncode == 0
    output = result.stdout + result.stderr
    test_result = {
        "passed": passed,
        "return_code": result.returncode,
        "output": output[:500] if len(output) > 500 else output
    }
    
    # Try to read coverage.json
    coverage_file = repo_full_path / "coverage.json"
    coverage_percent = None
    
    if coverage_file.exists():
        try:
            with open(coverage_file) as f:
                coverage_data = json.load(f)
                coverage_percent = coverage_data.get("totals", {}).get("percent_covered", 0)
        except Exception:
            pass
    
    return test_result, coverage_percent


def run_evaluation():
    """Main evaluation function."""
    run_id = str(uuid.uuid4())
    start_time = datetime.now()
    start_time_iso = start_time.isoformat()
    
    print(f"Starting evaluation (Run ID: {run_id})...")
    
    # 1. Run Tests against "repository_before" (Baseline)
    print("Running baseline tests (before)...")
    before_result = run_tests("repository_before")
    
    # 2. Run Tests with Coverage against "repository_after" (Solution)
    print("Running solution tests with coverage (after)...")
    after_result, coverage_percent = run_tests_with_coverage("repository_after")
    
    end_time = datetime.now()
    end_time_iso = end_time.isoformat()
    duration_seconds = (end_time - start_time).total_seconds()
    
    # 3. Generate Comparison Summary
    improvement_summary = "No improvement detected."
    if not before_result["passed"] and after_result["passed"]:
        improvement_summary = "Solution fixed failing tests and met all requirements."
    elif before_result["passed"] and after_result["passed"]:
        improvement_summary = "Tests passed in both states (Verify baseline expectation)."
    elif not after_result["passed"]:
        improvement_summary = "Solution failed to pass requirements."
    
    # 4. Construct the Final Report Object
    report = {
        "run_id": run_id,
        "started_at": start_time_iso,
        "finished_at": end_time_iso,
        "duration_seconds": duration_seconds,
        "environment": get_environment_info(),
        "before": {
            "tests": {
                "passed": before_result["passed"],
                "return_code": before_result["return_code"],
                "output": before_result["output"]
            },
            "metrics": {}
        },
        "after": {
            "tests": {
                "passed": after_result["passed"],
                "return_code": after_result["return_code"],
                "output": after_result["output"]
            },
            "metrics": {
                "coverage_percent": coverage_percent
            }
        },
        "comparison": {
            "passed_gate": after_result["passed"],
            "improvement_summary": improvement_summary
        },
        "success": after_result["passed"],
        "error": None
    }
    
    # Write the report to disk
    report_path = REPORTS_DIR / "report.json"
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)
    
    print(f"Evaluation complete. Success: {report['success']}")
    print(f"Report written to: {report_path}")
    
    if coverage_percent is not None:
        print(f"Coverage: {coverage_percent:.2f}%")
    
    # Exit with status code based on the 'After' result
    sys.exit(0 if report["success"] else 1)


if __name__ == "__main__":
    run_evaluation()
