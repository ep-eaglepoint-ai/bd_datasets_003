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
    print("=" * 60)
    print("RUNNING TESTS (REPOSITORY_AFTER)")
    print("=" * 60)
    print("Environment: repository_after")
    print("Tests directory: /app/tests")
    
    # Run pytest with JSON output
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
    
    # Parse results
    test_results = {
        "passed": 0,
        "failed": 0,
        "errors": 0,
        "skipped": 0,
        "total": 0,
        "tests": []
    }
    
    # Try to read JSON report
    report_file = Path("/tmp/pytest_report.json")
    if report_file.exists():
        with open(report_file) as f:
            pytest_report = json.load(f)
        
        summary = pytest_report.get("summary", {})
        test_results["passed"] = summary.get("passed", 0)
        test_results["failed"] = summary.get("failed", 0)
        test_results["errors"] = summary.get("error", 0)
        test_results["skipped"] = summary.get("skipped", 0)
        test_results["total"] = summary.get("total", 0)
        
        # Collect individual test results
        for test in pytest_report.get("tests", []):
            test_entry = {
                "nodeId": test.get("nodeid", ""),
                "status": test.get("outcome", "unknown"),
                "duration": test.get("duration", 0)
            }
            test_results["tests"].append(test_entry)
    else:
        # Fallback: parse stdout
        stdout = result.stdout
        for line in stdout.split("\n"):
            if " passed" in line:
                parts = line.split()
                for i, part in enumerate(parts):
                    if part == "passed" and i > 0:
                        try:
                            test_results["passed"] = int(parts[i-1])
                        except ValueError:
                            pass
        test_results["total"] = test_results["passed"] + test_results["failed"] + test_results["errors"]
    
    # Print results summary
    print(f"Results: {test_results['passed']} passed, {test_results['failed']} failed, "
          f"{test_results['errors']} errors, {test_results['skipped']} skipped "
          f"(total: {test_results['total']})")
    
    # Print individual test results
    for test in test_results["tests"]:
        status = test["status"]
        node_id = test["nodeId"]
        test_name = node_id.split("::")[-1] if "::" in node_id else node_id
        
        if status == "passed":
            symbol = "✓"
            status_str = "PASS"
        elif status == "failed":
            symbol = "✗"
            status_str = "FAIL"
        else:
            symbol = "○"
            status_str = status.upper()
        
        print(f" [{symbol} {status_str}] {test_name}")
    
    # Print evaluation summary
    print()
    print("=" * 60)
    print("EVALUATION SUMMARY")
    print("=" * 60)
    print("Implementation (repository_after):")
    
    overall_passed = test_results["failed"] == 0 and test_results["errors"] == 0
    print(f" Overall: {'PASSED' if overall_passed else 'FAILED'}")
    print(f" Tests: {test_results['passed']}/{test_results['total']} passed")
    
    print()
    print("=" * 60)
    print("EXPECTED BEHAVIOR CHECK")
    print("=" * 60)
    
    if overall_passed:
        print("[✓ OK] All tests passed (expected)")
    else:
        print("[✗ FAIL] Some tests failed")
    
    # Generate report
    end_time = datetime.now()
    duration_seconds = (end_time - start_time).total_seconds()
    
    # Create report directory
    date_path = start_time.strftime("%Y-%m-%d")
    time_path = start_time.strftime("%H-%M-%S")
    report_dir = Path(f"/app/evaluation/reports/{date_path}/{time_path}")
    report_dir.mkdir(parents=True, exist_ok=True)
    
    # Create report
    report = {
        "run_id": run_id,
        "task_title": TASK_TITLE,
        "start_time": format_timestamp(start_time),
        "end_time": format_timestamp(end_time),
        "duration_seconds": round(duration_seconds, 2),
        "test_results": {
            "passed": test_results["passed"],
            "failed": test_results["failed"],
            "errors": test_results["errors"],
            "skipped": test_results["skipped"],
            "total": test_results["total"],
            "tests": [{"nodeId": t["nodeId"], "status": t["status"]} for t in test_results["tests"]]
        },
        "overall_status": "PASSED" if overall_passed else "FAILED"
    }
    
    # Save report
    report_path = report_dir / "report.json"
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)
    
    print(f"Report saved to:")
    print(f"evaluation/reports/{date_path}/{time_path}/report.json")
    
    print()
    print("=" * 60)
    print("EVALUATION COMPLETE")
    print("=" * 60)
    print(f"Run ID: {run_id}")
    print(f"Duration: {duration_seconds:.2f}s")
    print(f"Success: {'YES' if overall_passed else 'NO'}")
    
    return 0 if overall_passed else 1


if __name__ == "__main__":
    sys.exit(run_tests())
