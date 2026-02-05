#!/usr/bin/env python3
"""
Evaluation Script for Payment Microservice Test Suite

Runs tests against repository_before and repository_after using Docker Compose,
compares results, and generates a JSON report.
"""
import json
import subprocess
import sys
import os
from datetime import datetime

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def run_tests(repo_path: str) -> dict:
    """Run pytest against the specified repository using Docker Compose."""
    # Determine PYTHONPATH value based on repo
    if "repository_after" in repo_path:
        pythonpath = "/app/repository_after"
    else:
        pythonpath = "/app/repository_before"
    
    result = subprocess.run(
        [
            "docker", "compose", "run", "--rm",
            "-e", f"PYTHONPATH={pythonpath}",
            "app", "pytest", "-q", "--tb=short", "tests/"
        ],
        capture_output=True,
        text=True,
        cwd=PROJECT_ROOT,
        timeout=300  # 5 minute timeout
    )
    
    output = result.stdout + result.stderr
    
    # Parse test results from output
    summary = {
        "exit_code": result.returncode,
        "tests_run": 0,
        "passed": 0,
        "failed": 0,
        "errors": 0,
        "output": output[-3000:]  # Last 3000 chars
    }
    
    # Count failed and error lines
    failed_count = output.count("FAILED")
    error_count = output.count("ERROR")
    
    # Parse summary line like "34 passed" or "0 passed, 30 failed"
    import re
    passed_match = re.search(r'(\d+) passed', output)
    failed_match = re.search(r'(\d+) failed', output)
    
    if passed_match:
        summary["passed"] = int(passed_match.group(1))
    if failed_match:
        summary["failed"] = int(failed_match.group(1))
    
    summary["failed"] = failed_count
    summary["errors"] = error_count
    
    return summary


def generate_report(before_results: dict, after_results: dict) -> dict:
    """Generate comparison report."""
    report = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "repository_before": {
            "passed": before_results["passed"],
            "failed": before_results["failed"],
            "errors": before_results["errors"],
            "exit_code": before_results["exit_code"]
        },
        "repository_after": {
            "passed": after_results["passed"],
            "failed": after_results["failed"],
            "errors": after_results["errors"],
            "exit_code": after_results["exit_code"]
        },
        "improvement": {
            "tests_now_passing": after_results["passed"] - before_results["passed"],
            "tests_now_failing": before_results["failed"] - after_results["failed"],
            "status": "✅ All tests pass" if after_results["passed"] > 0 and after_results["failed"] == 0 else "⚠️ Some tests still failing"
        }
    }
    return report


def main():
    """Main evaluation entry point."""
    print("=" * 60)
    print("Payment Microservice Test Suite Evaluation")
    print("=" * 60)
    
    # Run tests on repository_before
    print("\n[1/2] Running tests on repository_before...")
    before_results = run_tests("repository_before")
    print(f"  Results: {before_results['passed']} passed, {before_results['failed']} failed, {before_results['errors']} errors")
    
    # Run tests on repository_after
    print("\n[2/2] Running tests on repository_after...")
    after_results = run_tests("repository_after")
    print(f"  Results: {after_results['passed']} passed, {after_results['failed']} failed, {after_results['errors']} errors")
    
    # Generate report
    report = generate_report(before_results, after_results)
    
    # Save report
    report_path = os.path.join(PROJECT_ROOT, "evaluation", "report.json")
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)
    
    print("\n" + "=" * 60)
    print("Evaluation Complete")
    print("=" * 60)
    print(f"Improvement: {report['improvement']['tests_now_passing']} additional tests passing")
    print(f"Status: {report['improvement']['status']}")
    print(f"\nReport saved to: {report_path}")
    
    return 0 if after_results["failed"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
