#!/usr/bin/env python3
"""
Evaluation runner for High-Throughput Log Stream Optimization.
Runs tests against repository_before and repository_after, generates reports.
"""

import json
import os
import subprocess
import sys
import uuid
from datetime import datetime
from pathlib import Path

TASK_TITLE = "High-Throughput Log Stream Optimization"


def run_tests(repo_path: str, tests_dir: str) -> dict:
    """Run Go tests and return results."""
    source_file = os.path.join(repo_path, "main.go")
    
    # Copy the main.go to tests directory for testing
    tests_path = Path(tests_dir)
    target_file = tests_path / "main.go"
    
    # Copy source file to tests directory
    with open(source_file, 'r') as f:
        source_content = f.read()
    with open(target_file, 'w') as f:
        f.write(source_content)
    
    # Run go test with JSON output
    env = os.environ.copy()
    env["SOURCE_FILE"] = source_file
    
    try:
        result = subprocess.run(
            ["go", "test", "-v", "-json", "./..."],
            cwd=tests_dir,
            capture_output=True,
            text=True,
            env=env,
            timeout=300
        )
    except subprocess.TimeoutExpired:
        return {
            "passed": 0,
            "failed": 1,
            "errors": 1,
            "skipped": 0,
            "total": 1,
            "tests": [{"nodeid": "timeout", "status": "error", "message": "Test timeout"}],
            "output": "Test execution timed out"
        }
    
    # Parse JSON output
    tests = []
    passed = 0
    failed = 0
    errors = 0
    skipped = 0
    
    for line in result.stdout.strip().split('\n'):
        if not line:
            continue
        try:
            event = json.loads(line)
            if event.get("Action") == "pass" and event.get("Test"):
                tests.append({
                    "nodeid": event.get("Test"),
                    "status": "passed"
                })
                passed += 1
            elif event.get("Action") == "fail" and event.get("Test"):
                tests.append({
                    "nodeid": event.get("Test"),
                    "status": "failed"
                })
                failed += 1
            elif event.get("Action") == "skip" and event.get("Test"):
                tests.append({
                    "nodeid": event.get("Test"),
                    "status": "skipped"
                })
                skipped += 1
        except json.JSONDecodeError:
            continue
    
    # Clean up copied file
    if target_file.exists():
        target_file.unlink()
    
    return {
        "passed": passed,
        "failed": failed,
        "errors": errors,
        "skipped": skipped,
        "total": passed + failed + errors + skipped,
        "tests": tests,
        "output": result.stdout + result.stderr,
        "exit_code": result.returncode
    }


def print_test_results(results: dict, env_name: str):
    """Print test results in required format."""
    print(f"\nResults: {results['passed']} passed, {results['failed']} failed, "
          f"{results['errors']} errors, {results['skipped']} skipped (total: {results['total']})")
    
    for test in results.get("tests", []):
        status_symbol = "✓ PASS" if test["status"] == "passed" else "✗ FAIL"
        print(f"  [{status_symbol}] {test['nodeid']}")


def main():
    run_id = str(uuid.uuid4())
    start_time = datetime.now()
    
    print(f"Run ID: {run_id}")
    print(f"Started at: {start_time.isoformat()}")
    print()
    print("=" * 60)
    print(f"{TASK_TITLE} EVALUATION")
    print("=" * 60)
    
    base_dir = Path("/app")
    tests_dir = str(base_dir / "tests")
    before_dir = str(base_dir / "repository_before")
    after_dir = str(base_dir / "repository_after")
    
    # Run tests for BEFORE
    print()
    print("=" * 60)
    print("RUNNING TESTS: BEFORE (REPOSITORY_BEFORE)")
    print("=" * 60)
    print(f"Environment: repository_before")
    print(f"Tests directory: {tests_dir}")
    
    before_results = run_tests(before_dir, tests_dir)
    print_test_results(before_results, "before")
    
    # Run tests for AFTER
    print()
    print("=" * 60)
    print("RUNNING TESTS: AFTER (REPOSITORY_AFTER)")
    print("=" * 60)
    print(f"Environment: repository_after")
    print(f"Tests directory: {tests_dir}")
    
    after_results = run_tests(after_dir, tests_dir)
    print_test_results(after_results, "after")
    
    # Summary
    print()
    print("=" * 60)
    print("EVALUATION SUMMARY")
    print("=" * 60)
    
    before_status = "FAILED" if before_results["failed"] > 0 or before_results["errors"] > 0 else "PASSED"
    after_status = "PASSED" if after_results["failed"] == 0 and after_results["errors"] == 0 else "FAILED"
    
    print()
    print("Before Implementation (repository_before):")
    print(f"  Overall: {before_status}")
    print(f"  Tests: {before_results['passed']}/{before_results['total']} passed")
    
    print()
    print("After Implementation (repository_after):")
    print(f"  Overall: {after_status}")
    print(f"  Tests: {after_results['passed']}/{after_results['total']} passed")
    
    # Expected behavior check
    print()
    print("=" * 60)
    print("EXPECTED BEHAVIOR CHECK")
    print("=" * 60)
    
    after_all_pass = after_results["failed"] == 0 and after_results["errors"] == 0
    before_has_failures = before_results["failed"] > 0 or before_results["errors"] > 0
    
    if after_all_pass:
        print("[✓ OK] After implementation: All tests passed (expected)")
    else:
        print("[✗ FAIL] After implementation: Some tests failed (unexpected)")
    
    if before_has_failures:
        print("[✓ OK] Before implementation: Tests failed (expected)")
    else:
        print("[✗ FAIL] Before implementation: All tests passed (unexpected - tests should fail)")
    
    # Generate report
    end_time = datetime.now()
    duration = (end_time - start_time).total_seconds()
    
    report = {
        "run_id": run_id,
        "task_title": TASK_TITLE,
        "start_time": start_time.isoformat(),
        "end_time": end_time.isoformat(),
        "duration_seconds": duration,
        "before_results": {
            "overall_status": before_status,
            "passed": before_results["passed"],
            "failed": before_results["failed"],
            "errors": before_results["errors"],
            "skipped": before_results["skipped"],
            "total": before_results["total"],
            "tests": before_results["tests"]
        },
        "after_results": {
            "overall_status": after_status,
            "passed": after_results["passed"],
            "failed": after_results["failed"],
            "errors": after_results["errors"],
            "skipped": after_results["skipped"],
            "total": after_results["total"],
            "tests": after_results["tests"]
        },
        "overall_status": "SUCCESS" if (after_all_pass and before_has_failures) else "FAILURE",
        "expected_behavior_validation": {
            "after_passes": after_all_pass,
            "before_fails": before_has_failures,
            "valid": after_all_pass and before_has_failures
        }
    }
    
    # Save report
    report_dir = base_dir / "evaluation" / "reports" / start_time.strftime("%Y-%m-%d") / start_time.strftime("%H-%M-%S")
    report_dir.mkdir(parents=True, exist_ok=True)
    report_path = report_dir / "report.json"
    
    with open(report_path, 'w') as f:
        json.dump(report, f, indent=2)
    
    print()
    print(f"Report saved to:")
    print(f"{report_path}")
    
    print()
    print("=" * 60)
    print("EVALUATION COMPLETE")
    print("=" * 60)
    print(f"Run ID: {run_id}")
    print(f"Duration: {duration:.2f}s")
    print(f"Success: {'YES' if report['overall_status'] == 'SUCCESS' else 'NO'}")
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
