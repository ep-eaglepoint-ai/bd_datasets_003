#!/usr/bin/env python3
"""Evaluation runner for Time Tracking App.

Runs tests, collects results, and generates JSON report.
"""

import json
import os
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path


def run_tests():
    """Run pytest and capture results."""
    result = subprocess.run(
        ["pytest", "-v", "--tb=short", "tests/"],
        capture_output=True,
        text=True,
        cwd="/app"
    )
    return result.stdout, result.stderr, result.returncode


def parse_test_results(stdout, stderr):
    """Parse pytest output to extract test results."""
    tests = []
    lines = stdout.split('\n') + stderr.split('\n')
    
    for line in lines:
        line = line.strip()
        if '::' in line:
            if ' PASSED' in line:
                nodeid = line.split(' PASSED')[0].strip()
                tests.append({"nodeid": nodeid, "status": "passed"})
            elif ' FAILED' in line:
                nodeid = line.split(' FAILED')[0].strip()
                tests.append({"nodeid": nodeid, "status": "failed"})
            elif ' ERROR' in line:
                nodeid = line.split(' ERROR')[0].strip()
                tests.append({"nodeid": nodeid, "status": "error"})
            elif ' SKIPPED' in line:
                nodeid = line.split(' SKIPPED')[0].strip()
                tests.append({"nodeid": nodeid, "status": "skipped"})
    
    return tests


def count_results(tests):
    """Count test results by status."""
    passed = sum(1 for t in tests if t["status"] == "passed")
    failed = sum(1 for t in tests if t["status"] == "failed")
    errors = sum(1 for t in tests if t["status"] == "error")
    skipped = sum(1 for t in tests if t["status"] == "skipped")
    return passed, failed, errors, skipped


def save_report(report, run_id):
    """Save JSON report to file."""
    now = datetime.now(timezone.utc)
    date_dir = now.strftime("%Y-%m-%d")
    time_dir = now.strftime("%H-%M-%S")
    
    report_dir = Path("/app/evaluation/reports") / date_dir / time_dir
    report_dir.mkdir(parents=True, exist_ok=True)
    
    report_path = report_dir / "report.json"
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2, default=str)
    
    return str(report_path)


def main():
    """Main evaluation function."""
    run_id = str(uuid.uuid4())
    start_time = datetime.now(timezone.utc)
    task_title = "Time Tracking App (Clock In / Clock Out & Reports)"
    
    print(f"Run ID: {run_id}")
    print(f"Started at: {start_time.isoformat()}")
    print("=" * 60)
    print(f"{task_title} EVALUATION")
    print("=" * 60)
    print()
    print("=" * 60)
    print("RUNNING TESTS (REPOSITORY_AFTER)")
    print("=" * 60)
    print("Environment: repository_after")
    print("Tests directory: /app/tests")
    print()
    
    stdout, stderr, returncode = run_tests()
    tests = parse_test_results(stdout, stderr)
    passed, failed, errors, skipped = count_results(tests)
    total = len(tests)
    
    print(f"Results: {passed} passed, {failed} failed, {errors} errors, {skipped} skipped (total: {total})")
    print()
    
    for test in tests:
        status_icon = "✓ PASS" if test["status"] == "passed" else "✗ FAIL"
        print(f" [{status_icon}] {test['nodeid']}")
    
    print()
    print("=" * 60)
    print("EVALUATION SUMMARY")
    print("=" * 60)
    print()
    
    overall_status = "PASSED" if failed == 0 and errors == 0 else "FAILED"
    print("Implementation (repository_after):")
    print(f"  Overall: {overall_status}")
    print(f"  Tests: {passed}/{total} passed")
    print()
    
    print("=" * 60)
    print("EXPECTED BEHAVIOR CHECK")
    print("=" * 60)
    
    if failed == 0 and errors == 0:
        print("[✓ OK] All tests passed (expected)")
    else:
        print("[✗ FAIL] Some tests failed")
    
    end_time = datetime.now(timezone.utc)
    duration = (end_time - start_time).total_seconds()
    
    report = {
        "run_id": run_id,
        "task_title": task_title,
        "start_time": start_time.isoformat(),
        "end_time": end_time.isoformat(),
        "duration_seconds": duration,
        "test_results": {
            "tests": tests,
            "summary": {
                "passed": passed,
                "failed": failed,
                "errors": errors,
                "skipped": skipped,
                "total": total
            }
        },
        "overall_status": overall_status
    }
    
    report_path = save_report(report, run_id)
    
    print()
    print("Report saved to:")
    print(report_path)
    print()
    print("=" * 60)
    print("EVALUATION COMPLETE")
    print("=" * 60)
    print(f"Run ID: {run_id}")
    print(f"Duration: {duration:.2f}s")
    print(f"Success: {'YES' if overall_status == 'PASSED' else 'NO'}")
    
    sys.exit(0 if overall_status == "PASSED" else 1)


if __name__ == "__main__":
    main()
