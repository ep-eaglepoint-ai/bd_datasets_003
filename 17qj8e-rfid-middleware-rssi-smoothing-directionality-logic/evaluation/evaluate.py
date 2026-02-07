#!/usr/bin/env python3
"""
Evaluation script for RFID Middleware RSSI Smoothing & Directionality Logic

This script runs tests against both repository_before and repository_after,
then generates a comparison report in JSON format.
"""

import subprocess
import json
import os
import sys
import platform
import uuid
from datetime import datetime
from pathlib import Path


# Get the root directory (parent of evaluation folder)
ROOT = Path(__file__).parent.parent
REPORTS_DIR = ROOT / "evaluation" / "reports"
TESTS_DIR = ROOT / "tests"


def get_environment_info():
    """Get information about the execution environment."""
    return {
        "python_version": sys.version.split()[0],
        "platform": platform.platform(),
        "arch": platform.machine(),
        "cpus": os.cpu_count(),
    }


def run_tests(repo_path):
    """
    Runs the unittest test suite with a specific REPO_PATH environment variable.
    
    Args:
        repo_path: Path to the repository folder to test (e.g., 'repository_before' or 'repository_after')
    
    Returns:
        dict: Test results with 'passed', 'return_code', 'output', and optional 'details'
    """
    print(f"Running tests against {repo_path}...")
    
    # Set up environment with REPO_PATH
    env = os.environ.copy()
    env["REPO_PATH"] = repo_path
    env["CI"] = "true"
    
    # Run unittest with verbose output
    # Using python -m unittest to ensure proper module resolution
    cmd = [
        sys.executable,
        "-m",
        "unittest",
        "discover",
        "-s",
        str(TESTS_DIR),
        "-p",
        "test_*.py",
        "-v"
    ]
    
    try:
        # Run the tests and capture output
        result = subprocess.run(
            cmd,
            cwd=str(ROOT),
            env=env,
            capture_output=True,
            text=True,
            timeout=300  # 5 minute timeout
        )
        
        passed = result.returncode == 0
        output = result.stdout + result.stderr
        
        # Try to parse test results from output
        # Count test results if available
        test_details = None
        if "OK" in output or "FAILED" in output or "ERROR" in output:
            # Extract basic test summary
            lines = output.split('\n')
            test_summary = []
            for line in lines:
                if "test_" in line and ("ok" in line.lower() or "FAIL" in line or "ERROR" in line):
                    test_summary.append(line.strip())
            if test_summary:
                test_details = {
                    "summary_lines": test_summary[-10:]  # Last 10 test lines
                }
        
        return {
            "passed": passed,
            "return_code": result.returncode,
            "output": output[:2000] if len(output) > 2000 else output,  # Truncate if too long
            "details": test_details
        }
    
    except subprocess.TimeoutExpired:
        return {
            "passed": False,
            "return_code": -1,
            "output": "Test execution timed out after 5 minutes.",
            "details": None
        }
    except Exception as e:
        return {
            "passed": False,
            "return_code": -1,
            "output": f"Error running tests: {str(e)}",
            "details": None
        }


def run_evaluation():
    """Main evaluation function that runs tests and generates report."""
    run_id = str(uuid.uuid4())
    start_time = datetime.now()
    start_time_iso = start_time.isoformat()
    
    print(f"Starting evaluation (Run ID: {run_id})...")
    
    # Ensure reports directory exists
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    
    # 1. Run Tests against "repository_before" (Baseline)
    # This might fail if repository_before is empty or incomplete
    print("\n" + "="*60)
    print("Running baseline tests (repository_before)...")
    print("="*60)
    before_result = run_tests("repository_before")
    
    # 2. Run Tests against "repository_after" (Implementation)
    print("\n" + "="*60)
    print("Running implementation tests (repository_after)...")
    print("="*60)
    after_result = run_tests("repository_after")
    
    end_time = datetime.now()
    end_time_iso = end_time.isoformat()
    duration_seconds = (end_time - start_time).total_seconds()
    
    # 3. Generate Comparison Summary
    improvement_summary = "No improvement detected."
    if not before_result["passed"] and after_result["passed"]:
        improvement_summary = "Implementation fixed failing tests and met all requirements."
    elif before_result["passed"] and after_result["passed"]:
        improvement_summary = "Tests passed in both states (Verify baseline expectation)."
    elif not after_result["passed"]:
        improvement_summary = "Implementation failed to pass requirements."
    elif before_result["passed"] and not after_result["passed"]:
        improvement_summary = "Implementation regressed from baseline."
    
    # 4. Construct the Final Report Object
    report = {
        "run_id": run_id,
        "started_at": start_time_iso,
        "finished_at": end_time_iso,
        "duration_seconds": round(duration_seconds, 2),
        "environment": get_environment_info(),
        "before": {
            "tests": {
                "passed": before_result["passed"],
                "return_code": before_result["return_code"],
                "output": before_result["output"][:500] if len(before_result["output"]) > 500 else before_result["output"]
            },
            "metrics": {}  # Placeholders for future metrics (e.g., memory usage, execution time)
        },
        "after": {
            "tests": {
                "passed": after_result["passed"],
                "return_code": after_result["return_code"],
                "output": after_result["output"][:500] if len(after_result["output"]) > 500 else after_result["output"]
            },
            "metrics": {}
        },
        "comparison": {
            "passed_gate": after_result["passed"],
            "improvement_summary": improvement_summary
        },
        "success": after_result["passed"],
        "error": None
    }
    
    # Add detailed test information if available
    if before_result.get("details"):
        report["before"]["tests"]["details"] = before_result["details"]
    if after_result.get("details"):
        report["after"]["tests"]["details"] = after_result["details"]
    
    # Write the report to disk
    report_path = REPORTS_DIR / "report.json"
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)
    
    print("\n" + "="*60)
    print("Evaluation Summary")
    print("="*60)
    print(f"Before (baseline): {'PASSED' if before_result['passed'] else 'FAILED'}")
    print(f"After (implementation): {'PASSED' if after_result['passed'] else 'FAILED'}")
    print(f"Overall Success: {report['success']}")
    print(f"Improvement: {improvement_summary}")
    print(f"\nReport written to: {report_path}")
    print("="*60)
    
    # Exit with status code based on the 'After' result
    sys.exit(0 if report["success"] else 1)


if __name__ == "__main__":
    run_evaluation()

