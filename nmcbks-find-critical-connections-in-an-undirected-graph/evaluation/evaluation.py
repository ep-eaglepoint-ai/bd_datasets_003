#!/usr/bin/env python3

import json
import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from uuid import uuid4
import platform


# Paths
ROOT = Path(__file__).parent.parent
REPORTS_DIR = ROOT / "evaluation" / "reports"
REPO_BEFORE = ROOT / "repository_before"
REPO_AFTER = ROOT / "repository_after"

# Ensure reports directory exists
REPORTS_DIR.mkdir(parents=True, exist_ok=True)


def get_environment_info():
    """Gather environment information for the report."""
    return {
        "python_version": sys.version,
        "platform": platform.platform(),
        "architecture": platform.machine(),
        "processor": platform.processor(),
    }


def run_tests(repo_path):
    """
    Run pytest test suite for a specific repository.
    
    Args:
        repo_path: Path to the repository to test
    
    Returns:
        dict: Test results with passed status, return code, and output
    """
    print(f"\nRunning tests for: {repo_path.name}")
    
    # Change to repo directory and run tests
    try:
        result = subprocess.run(
            [sys.executable, "-m", "pytest", "test/", "-v", "--tb=short", "--json-report", 
             "--json-report-file=test_report.json"],
            cwd=repo_path,
            capture_output=True,
            text=True,
            timeout=300  # 5 minute timeout
        )
        
        passed = result.returncode == 0
        output = result.stdout + result.stderr
        
        # Try to load JSON report if available
        json_report_path = repo_path / "test_report.json"
        test_details = None
        if json_report_path.exists():
            try:
                with open(json_report_path, 'r') as f:
                    test_details = json.load(f)
            except Exception as e:
                print(f"Warning: Could not parse JSON test report: {e}")
        
        return {
            "passed": passed,
            "return_code": result.returncode,
            "output": output[:1000],  # Truncate long output
            "details": test_details
        }
    
    except subprocess.TimeoutExpired:
        return {
            "passed": False,
            "return_code": -1,
            "output": "Tests timed out after 300 seconds",
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
    """Main evaluation function."""
    run_id = str(uuid4())
    start_time = datetime.now()
    start_time_iso = start_time.isoformat()
    
    print(f"Starting evaluation (Run ID: {run_id})...")
    print(f"Started at: {start_time_iso}")
    
    # 1. Run tests against repository_before (Baseline)
    print("\n" + "="*60)
    print("BASELINE TESTS (repository_before)")
    print("="*60)
    before_result = run_tests(REPO_BEFORE)
    
    # 2. Run tests against repository_after (Refactored)
    print("\n" + "="*60)
    print("REFACTORED TESTS (repository_after)")
    print("="*60)
    after_result = run_tests(REPO_AFTER)
    
    end_time = datetime.now()
    end_time_iso = end_time.isoformat()
    duration_seconds = (end_time - start_time).total_seconds()
    
    # 3. Generate comparison summary
    summary = "No improvement detected."
    if not before_result["passed"] and after_result["passed"]:
        summary = "All tests passed and met requirements."
    elif before_result["passed"] and after_result["passed"]:
        summary = "Tests passed in both states (Both implementations working)."
    elif before_result["passed"] and not after_result["passed"]:
        summary = "Regression: Refactored code introduced failures."
    elif not after_result["passed"]:
        summary = "Refactored code failed to pass requirements."
    
    # 4. Construct the final report
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
            "metrics": {}  # Placeholder for future metrics
        },
        "after": {
            "tests": {
                "passed": after_result["passed"],
                "return_code": after_result["return_code"],
                "output": after_result["output"]
            },
            "metrics": {}  # Placeholder for future metrics
        },
        "comparison": {
            "passed_gate": after_result["passed"],
            "summary": summary
        },
        "success": after_result["passed"],
        "error": None
    }
    
    # 5. Write report to disk
    report_path = REPORTS_DIR / "report.json"
    with open(report_path, 'w') as f:
        json.dump(report, f, indent=2)
    
    # Print summary
    print("\n" + "="*60)
    print("EVALUATION SUMMARY")
    print("="*60)
    print(f"Run ID: {run_id}")
    print(f"Duration: {duration_seconds:.2f} seconds")
    print(f"\nBaseline (before): {'✓ PASSED' if before_result['passed'] else '✗ FAILED'}")
    print(f"Refactored (after): {'✓ PASSED' if after_result['passed'] else '✗ FAILED'}")
    print(f"\nImprovement: {summary}")
    print(f"\nOverall Success: {report['success']}")
    print(f"\nReport written to: {report_path}")
    print("="*60)
    
    # Exit with appropriate code
    sys.exit(0 if report["success"] else 1)


if __name__ == "__main__":
    try:
        run_evaluation()
    except Exception as e:
        print(f"\nEvaluation failed with error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)