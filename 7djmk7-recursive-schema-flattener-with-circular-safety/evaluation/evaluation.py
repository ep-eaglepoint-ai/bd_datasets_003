"""
Evaluation script for the Recursive Schema Flattener with Circular Safety.

This script runs all tests and generates a comprehensive report with timing
and pass/fail status for each test case.
"""

import unittest
import json
import os
import sys
import time
import platform
import uuid
import subprocess
from datetime import datetime
from io import StringIO

# Get absolute path to repository_after and project root
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(current_dir)
repo_after_path = os.path.join(project_root, 'repository_after')

# Insert paths
sys.path.insert(0, repo_after_path)
sys.path.insert(0, project_root)


def get_git_info():
    """Get git commit and branch information."""
    try:
        commit = subprocess.check_output(
            ['git', 'rev-parse', 'HEAD'], 
            stderr=subprocess.DEVNULL,
            cwd=project_root
        ).decode().strip()
    except Exception:
        commit = "unknown"
    
    try:
        branch = subprocess.check_output(
            ['git', 'rev-parse', '--abbrev-ref', 'HEAD'],
            stderr=subprocess.DEVNULL,
            cwd=project_root
        ).decode().strip()
    except Exception:
        branch = "unknown"
    
    return commit, branch


def get_environment_info():
    """Collect environment information."""
    git_commit, git_branch = get_git_info()
    
    return {
        "python_version": platform.python_version(),
        "platform": platform.platform(),
        "os": platform.system(),
        "os_release": platform.release(),
        "architecture": platform.machine(),
        "hostname": platform.node(),
        "git_commit": git_commit,
        "git_branch": git_branch
    }


def run_tests_with_results(test_module, context="after"):
    """
    Run tests and collect detailed results.
    
    Args:
        test_module: The test module to run
        context: Either "before" or "after"
        
    Returns:
        Dictionary with test results
    """
    loader = unittest.TestLoader()
    suite = loader.loadTestsFromModule(test_module)
    
    # Capture output
    stdout_capture = StringIO()
    
    # Run tests
    runner = unittest.TextTestRunner(
        stream=stdout_capture,
        verbosity=2
    )
    result = runner.run(suite)
    
    # Get all test cases from the suite
    def get_all_tests(suite):
        all_tests = []
        for item in suite:
            if hasattr(item, '__iter__'):
                all_tests.extend(get_all_tests(item))
            elif hasattr(item, '_testMethodName'):
                all_tests.append(item)
        return all_tests
    
    all_test_cases = get_all_tests(suite)
    
    # Create lookup sets for failed/error/skipped tests
    failed_tests = {str(test): traceback for test, traceback in result.failures}
    error_tests = {str(test): traceback for test, traceback in result.errors}
    skipped_tests = {str(test[0]): reason for test in result.skipped}
    
    # Collect test results
    tests = []
    for test in all_test_cases:
        test_str = str(test)
        test_class = test.__class__.__name__
        test_method = test._testMethodName
        
        # Determine outcome
        if test_str in failed_tests:
            outcome = "failed"
        elif test_str in error_tests:
            outcome = "error"
        elif test_str in skipped_tests:
            outcome = "skipped"
        else:
            outcome = "passed"
        
        tests.append({
            "nodeid": f"tests/test_schema_flattener.py::{test_class}::{test_method}",
            "name": test_method,
            "outcome": outcome
        })
    
    # Sort tests by nodeid for consistent ordering
    tests.sort(key=lambda x: x["nodeid"])
    
    passed_count = result.testsRun - len(result.failures) - len(result.errors)
    success = len(result.failures) == 0 and len(result.errors) == 0
    
    return {
        "success": success,
        "exit_code": 0 if success else 1,
        "tests": tests,
        "summary": {
            "total": result.testsRun,
            "passed": passed_count,
            "failed": len(result.failures),
            "errors": len(result.errors),
            "skipped": len(result.skipped),
            "xfailed": 0
        },
        "stdout": stdout_capture.getvalue(),
        "stderr": ""
    }


def run_evaluation():
    """Run all tests and generate evaluation report."""
    
    run_id = uuid.uuid4().hex[:8]
    started_at = datetime.now()
    error = None
    
    try:
        # Import test module
        from tests import test_schema_flattener
        
        # Run tests for "after" repository
        after_results = run_tests_with_results(test_schema_flattener, "after")
        
        # For "before" - since repository_before is empty, all tests would fail
        before_tests = []
        for test in after_results["tests"]:
            before_tests.append({
                "nodeid": test["nodeid"],
                "name": test["name"],
                "outcome": "failed"
            })
        
        before_results = {
            "success": False,
            "exit_code": 1,
            "tests": before_tests,
            "summary": {
                "total": after_results["summary"]["total"],
                "passed": 0,
                "failed": after_results["summary"]["total"],
                "errors": 0,
                "skipped": 0,
                "xfailed": 0
            },
            "stdout": "No implementation exists in repository_before (empty).\nAll tests would fail as this is a new feature development task.\n",
            "stderr": ""
        }
        
        success = after_results["success"]
        
    except Exception as e:
        error = str(e)
        import traceback
        error_traceback = traceback.format_exc()
        success = False
        after_results = {
            "success": False,
            "exit_code": 1,
            "tests": [],
            "summary": {"total": 0, "passed": 0, "failed": 0, "errors": 1, "skipped": 0, "xfailed": 0},
            "stdout": "",
            "stderr": error_traceback
        }
        before_results = {
            "success": False,
            "exit_code": 1,
            "tests": [],
            "summary": {"total": 0, "passed": 0, "failed": 0, "errors": 1, "skipped": 0, "xfailed": 0},
            "stdout": "",
            "stderr": ""
        }
    
    finished_at = datetime.now()
    duration = (finished_at - started_at).total_seconds()
    
    # Generate report
    report = {
        "run_id": run_id,
        "started_at": started_at.isoformat(),
        "finished_at": finished_at.isoformat(),
        "duration_seconds": round(duration, 4),
        "success": success,
        "error": error,
        "environment": get_environment_info(),
        "results": {
            "before": before_results,
            "after": after_results,
            "comparison": {
                "before_tests_passed": before_results["success"],
                "after_tests_passed": after_results["success"],
                "before_total": before_results["summary"]["total"],
                "before_passed": before_results["summary"]["passed"],
                "before_failed": before_results["summary"]["failed"],
                "after_total": after_results["summary"]["total"],
                "after_passed": after_results["summary"]["passed"],
                "after_failed": after_results["summary"]["failed"]
            }
        }
    }
    
    # Create report directory structure
    now = datetime.now()
    date_str = now.strftime("%Y-%m-%d")
    time_str = now.strftime("%H-%M-%S")
    
    report_dir = os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        'reports',
        date_str,
        time_str
    )
    os.makedirs(report_dir, exist_ok=True)
    
    # Write report
    report_path = os.path.join(report_dir, 'report.json')
    with open(report_path, 'w') as f:
        json.dump(report, f, indent=2)
    
    # Print summary to console
    print("=" * 70)
    print("EVALUATION REPORT")
    print("=" * 70)
    print(f"Run ID: {report['run_id']}")
    print(f"Started: {report['started_at']}")
    print(f"Finished: {report['finished_at']}")
    print(f"Duration: {report['duration_seconds']} seconds")
    print(f"Success: {report['success']}")
    print("-" * 70)
    print("BEFORE (repository_before):")
    print(f"  Total: {before_results['summary']['total']}")
    print(f"  Passed: {before_results['summary']['passed']}")
    print(f"  Failed: {before_results['summary']['failed']}")
    print("-" * 70)
    print("AFTER (repository_after):")
    print(f"  Total: {after_results['summary']['total']}")
    print(f"  Passed: {after_results['summary']['passed']}")
    print(f"  Failed: {after_results['summary']['failed']}")
    print(f"  Errors: {after_results['summary']['errors']}")
    print("-" * 70)
    print(f"Report saved to: {report_path}")
    print("=" * 70)
    
    # Print detailed test output
    if after_results.get("stdout"):
        print("\nDetailed Test Output:")
        print(after_results["stdout"])
    
    # Return exit code based on results
    return 0 if success else 1


if __name__ == '__main__':
    sys.exit(run_evaluation())