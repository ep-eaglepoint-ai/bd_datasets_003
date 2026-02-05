#!/usr/bin/env python3
"""
Evaluation Runner for Linear Regression Implementation

Runs tests against repository_after and generates a structured JSON report.
"""

import json
import os
import sys
import uuid
import subprocess
from datetime import datetime
from pathlib import Path

TASK_TITLE = "Linear Regression Implementation"


def generate_run_id():
    """Generate a unique run ID."""
    return str(uuid.uuid4())


def format_timestamp(dt):
    """Format datetime as ISO timestamp."""
    return dt.isoformat()


def get_environment_info():
    """Get Python version and platform information."""
    return {
        "python_version": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
        "platform": f"{sys.platform}-{os.uname().machine if hasattr(os, 'uname') else 'unknown'}"
    }


def run_pytest():
    """Run pytest and capture output and return code."""
    try:
        result = subprocess.run(
            [
                sys.executable, "-m", "pytest",
                "tests/",
                "-v",
                "--tb=short",
                "--json-report",
                "--json-report-file=/tmp/pytest_report.json"
            ],
            capture_output=True,
            text=True,
            cwd="/app"
        )
        
        # Parse JSON report if available
        test_details = {
            "return_code": result.returncode,
            "output": result.stdout[:1000] + ("..." if len(result.stdout) > 1000 else "")
        }
        
        # Determine if tests passed (return code 0)
        test_details["passed"] = result.returncode == 0
        
        # Try to get more detailed results from JSON report
        report_file = Path("/tmp/pytest_report.json")
        if report_file.exists():
            with open(report_file) as f:
                pytest_report = json.load(f)
            
            summary = pytest_report.get("summary", {})
            test_details["summary"] = {
                "passed": summary.get("passed", 0),
                "failed": summary.get("failed", 0),
                "errors": summary.get("error", 0),
                "skipped": summary.get("skipped", 0),
                "total": summary.get("total", 0)
            }
        
        return test_details, None
        
    except Exception as e:
        return {
            "passed": False,
            "return_code": 1,
            "output": f"Error running tests: {str(e)}"
        }, str(e)


def run_tests():
    """Run pytest and collect results."""
    run_id = generate_run_id()
    start_time = datetime.now()
    
    print(f"Run ID: {run_id}")
    print(f"Started at: {format_timestamp(start_time)}")
    print("=" * 60)
    print(f"{TASK_TITLE.upper()} EVALUATION")
    print("=" * 60)
    print()
    
    # Get environment info
    environment = get_environment_info()
    print(f"Python version: {environment['python_version']}")
    print(f"Platform: {environment['platform']}")
    print()
    
    print("=" * 60)
    print("RUNNING TESTS (REPOSITORY_AFTER)")
    print("=" * 60)
    
    # Run tests for "after" state
    after_tests, after_error = run_pytest()
    
    # Print test results summary
    if after_tests["passed"]:
        print("[✓] All tests passed")
    else:
        print("[✗] Some tests failed")
    print(f"Return code: {after_tests['return_code']}")
    
    if "summary" in after_tests:
        s = after_tests["summary"]
        print(f"Test summary: {s['passed']} passed, {s['failed']} failed, "
              f"{s['errors']} errors, {s['skipped']} skipped (total: {s['total']})")
    
    # Generate comparison data
    passed_gate = after_tests["passed"]
    
    if after_tests["passed"]:
        improvement_summary = "All tests pass. Implementation meets requirements."
    else:
        improvement_summary = "Some tests fail. Review implementation against requirements."
    
    # Determine overall success
    success = after_error is None
    
    # Create final report
    end_time = datetime.now()
    duration_seconds = (end_time - start_time).total_seconds()
    
    report = {
        "run_id": run_id,
        "started_at": format_timestamp(start_time),
        "finished_at": format_timestamp(end_time),
        "duration_seconds": round(duration_seconds, 2),
        "environment": environment,
        "before": {
            "tests": None,
            "metrics": {}
        },
        "after": {
            "tests": after_tests,
            "metrics": {}
        },
        "comparison": {
            "passed_gate": passed_gate,
            "improvement_summary": improvement_summary
        },
        "success": success,
        "error": after_error
    }
    
    # Save report
    date_path = start_time.strftime("%Y-%m-%d")
    time_path = start_time.strftime("%H-%M-%S")
    report_dir = Path(f"/app/evaluation/reports/{date_path}/{time_path}")
    report_dir.mkdir(parents=True, exist_ok=True)
    
    report_path = report_dir / "report.json"
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)
    
    # Print final summary
    print()
    print("=" * 60)
    print("EVALUATION SUMMARY")
    print("=" * 60)
    print(f"Run ID: {run_id}")
    print(f"Duration: {duration_seconds:.2f}s")
    print(f"Environment: {environment['python_version']} on {environment['platform']}")
    print()
    print("Test Results:")
    print(f"  Status: {'PASSED' if after_tests['passed'] else 'FAILED'}")
    print(f"  Return Code: {after_tests['return_code']}")
    print()
    print("Comparison:")
    print(f"  Passed Gate: {passed_gate}")
    print(f"  Summary: {improvement_summary}")
    print()
    print(f"Overall Evaluation Success: {'YES' if success else 'NO'}")
    if after_error:
        print(f"Error: {after_error}")
    
    print()
    print("=" * 60)
    print("REPORT GENERATED")
    print("=" * 60)
    print(f"Report saved to: evaluation/reports/{date_path}/{time_path}/report.json")
    
    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(run_tests())