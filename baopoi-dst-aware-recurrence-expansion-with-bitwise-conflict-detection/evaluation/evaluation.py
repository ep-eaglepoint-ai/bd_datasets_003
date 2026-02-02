#!/usr/bin/env python3
"""
Evaluation runner for DST-Aware Recurrence Expansion with Bitwise Conflict Detection.

This script runs tests against repository_after and generates a structured JSON report.
"""

import json
import os
import subprocess
import sys
import uuid
from datetime import datetime
from pathlib import Path


TASK_TITLE = "DST-Aware Recurrence Expansion with Bitwise Conflict Detection"


def run_tests(tests_dir: str, repo_path: str) -> dict:
    """
    Run pytest and collect results.
    
    Args:
        tests_dir: Path to tests directory
        repo_path: Path to repository being tested
        
    Returns:
        Dictionary with test results
    """
    import re
    
    # Run pytest with verbose output
    result = subprocess.run(
        [
            sys.executable, "-m", "pytest",
            tests_dir,
            "-v",
            "--tb=short",
        ],
        capture_output=True,
        text=True,
        cwd=repo_path,
        env={**os.environ, "PYTHONPATH": repo_path}
    )
    
    # Parse output to extract test results
    output = result.stdout + result.stderr
    
    tests = []
    passed = 0
    failed = 0
    errors = 0
    skipped = 0
    
    # Parse verbose pytest output - look for lines with :: and status
    for line in output.split('\n'):
        # Match patterns like "tests/test_scheduler.py::TestClass::test_name PASSED"
        # Handle various formats including percentage indicators
        match = re.search(r'(tests/[^\s]+::[^\s]+)\s+(PASSED|FAILED|ERROR|SKIPPED)', line)
        if match:
            test_name = match.group(1)
            status = match.group(2).lower()
            tests.append({"nodeid": test_name, "status": status})
            if status == 'passed':
                passed += 1
            elif status == 'failed':
                failed += 1
            elif status == 'error':
                errors += 1
            elif status == 'skipped':
                skipped += 1
    
    # If no tests parsed, try to get counts from summary
    if not tests:
        for line in output.split('\n'):
            if 'passed' in line.lower() and ('failed' in line.lower() or '==' in line):
                match = re.search(r'(\d+)\s+passed', line)
                if match:
                    passed = int(match.group(1))
                match = re.search(r'(\d+)\s+failed', line)
                if match:
                    failed = int(match.group(1))
                match = re.search(r'(\d+)\s+error', line)
                if match:
                    errors = int(match.group(1))
                match = re.search(r'(\d+)\s+skipped', line)
                if match:
                    skipped = int(match.group(1))
                    
        # Generate placeholder test entries based on counts
        for i in range(passed):
            tests.append({"nodeid": f"test_{i+1}", "status": "passed"})
        for i in range(failed):
            tests.append({"nodeid": f"failed_test_{i+1}", "status": "failed"})
    
    return {
        "tests": tests,
        "passed": passed,
        "failed": failed,
        "errors": errors,
        "skipped": skipped,
        "total": passed + failed + errors + skipped,
        "output": output,
        "return_code": result.returncode,
    }


def print_test_results(results: dict, env_name: str) -> None:
    """Print test results in the required format."""
    print(f"Results: {results['passed']} passed, {results['failed']} failed, "
          f"{results['errors']} errors, {results['skipped']} skipped "
          f"(total: {results['total']})")
    
    for test in results['tests']:
        status = test['status']
        nodeid = test['nodeid']
        if status == 'passed':
            print(f"  [✓ PASS] {nodeid}")
        elif status == 'failed':
            print(f"  [✗ FAIL] {nodeid}")
        elif status == 'error':
            print(f"  [! ERROR] {nodeid}")
        elif status == 'skipped':
            print(f"  [- SKIP] {nodeid}")


def main():
    """Main evaluation entry point."""
    run_id = str(uuid.uuid4())
    start_time = datetime.now(tz=None)
    start_time_iso = start_time.strftime("%Y-%m-%dT%H:%M:%S") + "Z"
    
    print(f"Run ID: {run_id}")
    print(f"Started at: {start_time_iso}")
    print()
    print("=" * 60)
    print(f"{TASK_TITLE} EVALUATION")
    print("=" * 60)
    print()
    
    # Determine paths
    base_path = Path(__file__).parent.parent
    repo_after_path = base_path / "repository_after"
    tests_path = base_path / "tests"
    
    # Run tests for repository_after
    print("=" * 60)
    print("RUNNING TESTS (REPOSITORY_AFTER)")
    print("=" * 60)
    print(f"Environment: repository_after")
    print(f"Tests directory: /app/tests")
    print()
    
    after_results = run_tests(str(tests_path), str(base_path))
    print_test_results(after_results, "repository_after")
    
    # Calculate end time and duration
    end_time = datetime.now(tz=None)
    end_time_iso = end_time.strftime("%Y-%m-%dT%H:%M:%S") + "Z"
    duration = (end_time - start_time).total_seconds()
    
    # Determine overall status
    all_passed = after_results['failed'] == 0 and after_results['errors'] == 0
    overall_status = "PASSED" if all_passed else "FAILED"
    
    print()
    print("=" * 60)
    print("EVALUATION SUMMARY")
    print("=" * 60)
    print()
    print("Implementation (repository_after):")
    print(f"  Overall: {overall_status}")
    print(f"  Tests: {after_results['passed']}/{after_results['total']} passed")
    print()
    
    print("=" * 60)
    print("EXPECTED BEHAVIOR CHECK")
    print("=" * 60)
    if all_passed:
        print("[✓ OK] All tests passed (expected)")
    else:
        print("[✗ FAIL] Some tests failed")
    print()
    
    # Create report
    report = {
        "run_id": run_id,
        "task_title": TASK_TITLE,
        "start_time": start_time_iso,
        "end_time": end_time_iso,
        "duration_seconds": duration,
        "test_results": {
            "repository_after": {
                "passed": after_results['passed'],
                "failed": after_results['failed'],
                "errors": after_results['errors'],
                "skipped": after_results['skipped'],
                "total": after_results['total'],
                "tests": after_results['tests'],
            }
        },
        "overall_status": overall_status,
    }
    
    # Save report
    report_dir = base_path / "evaluation" / "reports" / start_time.strftime("%Y-%m-%d") / start_time.strftime("%H-%M-%S")
    report_dir.mkdir(parents=True, exist_ok=True)
    report_path = report_dir / "report.json"
    
    with open(report_path, 'w') as f:
        json.dump(report, f, indent=2)
    
    print(f"Report saved to:")
    print(f"evaluation/reports/{start_time.strftime('%Y-%m-%d')}/{start_time.strftime('%H-%M-%S')}/report.json")
    print()
    print("=" * 60)
    print("EVALUATION COMPLETE")
    print("=" * 60)
    print(f"Run ID: {run_id}")
    print(f"Duration: {duration:.1f}s")
    print(f"Success: {'YES' if all_passed else 'NO'}")
    print()
    
    # Exit with appropriate code
    sys.exit(0 if all_passed else 1)


if __name__ == "__main__":
    main()
