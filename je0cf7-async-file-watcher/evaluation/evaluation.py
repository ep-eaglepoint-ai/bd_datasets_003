"""
Evaluation script for AsyncFileWatcher tests.

Runs tests against both repository_before and repository_after,
and generates a comprehensive comparison report.

Report is saved to: evaluation/reports/YYYY-MM-DD/HH-MM-SS/report.json
"""

import json
import os
import sys
import subprocess
import platform
import socket
import uuid
import time
from datetime import datetime
from pathlib import Path


def get_environment_info():
    """Collect environment information."""
    git_commit = "unknown"
    git_branch = "unknown"
    
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            git_commit = result.stdout.strip()[:8]
    except Exception:
        pass
    
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            git_branch = result.stdout.strip()
    except Exception:
        pass
    
    return {
        "python_version": platform.python_version(),
        "platform": platform.platform(),
        "os": platform.system(),
        "os_release": platform.release(),
        "architecture": platform.machine(),
        "hostname": socket.gethostname(),
        "git_commit": git_commit,
        "git_branch": git_branch
    }


def run_tests_with_pythonpath(pythonpath, test_dir="tests"):
    """
    Run tests with specified PYTHONPATH and collect results.
    
    Returns tuple: (success, exit_code, tests, summary, stdout, stderr)
    """
    env = os.environ.copy()
    env["PYTHONPATH"] = pythonpath
    
    # Run pytest with verbose output
    cmd = [
        sys.executable, "-m", "pytest",
        test_dir,
        "-v",
        "--tb=short",
        "-q"
    ]
    
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            env=env,
            timeout=120
        )
        
        stdout = result.stdout
        stderr = result.stderr
        exit_code = result.returncode
        success = exit_code == 0
        
        # Parse test results from pytest output
        tests = []
        summary = {
            "total": 0,
            "passed": 0,
            "failed": 0,
            "errors": 0,
            "skipped": 0,
            "xfailed": 0
        }
        
        # Parse individual test results
        for line in stdout.split('\n'):
            line = line.strip()
            if '::' in line and ('PASSED' in line or 'FAILED' in line or 'ERROR' in line or 'SKIPPED' in line):
                # Extract test info
                if ' PASSED' in line:
                    nodeid = line.replace(' PASSED', '').strip()
                    outcome = 'passed'
                    summary['passed'] += 1
                elif ' FAILED' in line:
                    nodeid = line.replace(' FAILED', '').strip()
                    outcome = 'failed'
                    summary['failed'] += 1
                elif ' ERROR' in line:
                    nodeid = line.replace(' ERROR', '').strip()
                    outcome = 'error'
                    summary['errors'] += 1
                elif ' SKIPPED' in line:
                    nodeid = line.replace(' SKIPPED', '').strip()
                    outcome = 'skipped'
                    summary['skipped'] += 1
                else:
                    continue
                
                # Extract test name from nodeid
                if '::' in nodeid:
                    name = nodeid.split('::')[-1]
                else:
                    name = nodeid
                
                tests.append({
                    "nodeid": nodeid,
                    "name": name,
                    "outcome": outcome
                })
                summary['total'] += 1
        
        return success, exit_code, tests, summary, stdout, stderr
        
    except subprocess.TimeoutExpired:
        return False, 1, [], {"total": 0, "passed": 0, "failed": 0, "errors": 1, "skipped": 0, "xfailed": 0}, "", "Test execution timed out"
    except Exception as e:
        return False, 1, [], {"total": 0, "passed": 0, "failed": 0, "errors": 1, "skipped": 0, "xfailed": 0}, "", str(e)


def run_tests_unittest(pythonpath, test_dir="tests"):
    """
    Run tests using unittest with specified PYTHONPATH and collect results.
    Falls back method if pytest isn't available or for simpler parsing.
    """
    env = os.environ.copy()
    env["PYTHONPATH"] = pythonpath
    
    cmd = [
        sys.executable, "-m", "unittest", "discover",
        "-s", test_dir,
        "-v"
    ]
    
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            env=env,
            timeout=120
        )
        
        stdout = result.stdout
        stderr = result.stderr
        combined_output = stdout + stderr
        exit_code = result.returncode
        success = exit_code == 0
        
        tests = []
        summary = {
            "total": 0,
            "passed": 0,
            "failed": 0,
            "errors": 0,
            "skipped": 0,
            "xfailed": 0
        }
        
        # Parse unittest verbose output
        for line in combined_output.split('\n'):
            line = line.strip()
            
            # Match patterns like "test_name (module.Class.test_name) ... ok"
            if ' ... ' in line:
                parts = line.rsplit(' ... ', 1)
                if len(parts) == 2:
                    test_info = parts[0]
                    result_str = parts[1].lower()
                    
                    # Extract test name
                    if '(' in test_info and ')' in test_info:
                        name_part = test_info.split('(')[0].strip()
                        full_path = test_info.split('(')[1].rstrip(')')
                        nodeid = f"tests/test_async_file_watcher.py::{full_path.replace('.', '::')}"
                    else:
                        name_part = test_info
                        nodeid = test_info
                    
                    if 'ok' in result_str:
                        outcome = 'passed'
                        summary['passed'] += 1
                    elif 'fail' in result_str:
                        outcome = 'failed'
                        summary['failed'] += 1
                    elif 'error' in result_str:
                        outcome = 'error'
                        summary['errors'] += 1
                    elif 'skip' in result_str:
                        outcome = 'skipped'
                        summary['skipped'] += 1
                    else:
                        continue
                    
                    tests.append({
                        "nodeid": nodeid,
                        "name": name_part,
                        "outcome": outcome
                    })
                    summary['total'] += 1
        
        return success, exit_code, tests, summary, stdout, stderr
        
    except subprocess.TimeoutExpired:
        return False, 1, [], {"total": 0, "passed": 0, "failed": 0, "errors": 1, "skipped": 0, "xfailed": 0}, "", "Test execution timed out"
    except Exception as e:
        return False, 1, [], {"total": 0, "passed": 0, "failed": 0, "errors": 1, "skipped": 0, "xfailed": 0}, "", str(e)


def check_before_repository():
    """
    Check repository_before state - for new feature development it should be empty.
    Returns mock failed results since there's no implementation.
    """
    before_path = Path("repository_before")
    
    # Check if repository_before is empty or has no Python files
    python_files = list(before_path.glob("**/*.py"))
    
    if not python_files:
        # Empty repository - all tests should fail
        # We'll generate failed results for documentation
        return True  # is_empty
    return False


def generate_before_results(after_tests):
    """
    Generate failed results for repository_before when it's empty.
    All tests that pass in after should fail in before.
    """
    tests = []
    for test in after_tests:
        tests.append({
            "nodeid": test["nodeid"],
            "name": test["name"],
            "outcome": "failed"
        })
    
    total = len(tests)
    return {
        "success": False,
        "exit_code": 1,
        "tests": tests,
        "summary": {
            "total": total,
            "passed": 0,
            "failed": total,
            "errors": 0,
            "skipped": 0,
            "xfailed": 0
        },
        "stdout": "No implementation exists in repository_before (empty).\nAll tests would fail as this is a new feature development task.\n",
        "stderr": ""
    }


def run_evaluation():
    """Run complete evaluation and generate report."""
    
    # Generate unique run ID
    run_id = uuid.uuid4().hex[:8]
    
    # Record start time
    started_at = datetime.now()
    started_at_str = started_at.isoformat()
    
    error = None
    
    try:
        # Get environment info
        environment = get_environment_info()
        
        # Define paths
        base_path = Path.cwd()
        before_path = str(base_path / "repository_before")
        after_path = str(base_path / "repository_after")
        
        # Check if repository_before is empty (new feature task)
        is_before_empty = check_before_repository()
        
        # Run tests against repository_after first
        print("=" * 70)
        print("Running tests against repository_after...")
        print("=" * 70)
        
        after_pythonpath = f"{after_path}:{base_path}"
        after_success, after_exit, after_tests, after_summary, after_stdout, after_stderr = run_tests_unittest(
            after_pythonpath, "tests"
        )
        
        # Generate or run before results
        if is_before_empty:
            print("\n" + "=" * 70)
            print("repository_before is empty (new feature development)")
            print("Generating expected failed results...")
            print("=" * 70)
            
            before_results = generate_before_results(after_tests)
        else:
            print("\n" + "=" * 70)
            print("Running tests against repository_before...")
            print("=" * 70)
            
            before_pythonpath = f"{before_path}:{base_path}"
            before_success, before_exit, before_tests, before_summary, before_stdout, before_stderr = run_tests_unittest(
                before_pythonpath, "tests"
            )
            before_results = {
                "success": before_success,
                "exit_code": before_exit,
                "tests": before_tests,
                "summary": before_summary,
                "stdout": before_stdout,
                "stderr": before_stderr
            }
        
        after_results = {
            "success": after_success,
            "exit_code": after_exit,
            "tests": after_tests,
            "summary": after_summary,
            "stdout": after_stdout,
            "stderr": after_stderr
        }
        
        # Generate comparison
        comparison = {
            "before_tests_passed": before_results["success"],
            "after_tests_passed": after_results["success"],
            "before_total": before_results["summary"]["total"],
            "before_passed": before_results["summary"]["passed"],
            "before_failed": before_results["summary"]["failed"],
            "after_total": after_results["summary"]["total"],
            "after_passed": after_results["summary"]["passed"],
            "after_failed": after_results["summary"]["failed"]
        }
        
        overall_success = after_results["success"] and not before_results["success"]
        
    except Exception as e:
        error = str(e)
        overall_success = False
        before_results = {"success": False, "exit_code": 1, "tests": [], "summary": {"total": 0, "passed": 0, "failed": 0, "errors": 0, "skipped": 0, "xfailed": 0}, "stdout": "", "stderr": ""}
        after_results = {"success": False, "exit_code": 1, "tests": [], "summary": {"total": 0, "passed": 0, "failed": 0, "errors": 0, "skipped": 0, "xfailed": 0}, "stdout": "", "stderr": ""}
        comparison = {"before_tests_passed": False, "after_tests_passed": False, "before_total": 0, "before_passed": 0, "before_failed": 0, "after_total": 0, "after_passed": 0, "after_failed": 0}
        environment = get_environment_info()
    
    # Record end time
    finished_at = datetime.now()
    finished_at_str = finished_at.isoformat()
    duration_seconds = round((finished_at - started_at).total_seconds(), 4)
    
    # Build final report
    report = {
        "run_id": run_id,
        "started_at": started_at_str,
        "finished_at": finished_at_str,
        "duration_seconds": duration_seconds,
        "success": overall_success,
        "error": error,
        "environment": environment,
        "results": {
            "before": before_results,
            "after": after_results,
            "comparison": comparison
        }
    }
    
    # Create report directory
    date_str = started_at.strftime("%Y-%m-%d")
    time_str = started_at.strftime("%H-%M-%S")
    report_dir = Path("evaluation/reports") / date_str / time_str
    report_dir.mkdir(parents=True, exist_ok=True)
    
    # Write report
    report_path = report_dir / "report.json"
    with open(report_path, 'w') as f:
        json.dump(report, f, indent=2)
    
    # Print summary to console
    print("\n" + "=" * 70)
    print("ASYNC FILE WATCHER - EVALUATION REPORT")
    print("=" * 70)
    print(f"Run ID:           {run_id}")
    print(f"Started:          {started_at_str}")
    print(f"Finished:         {finished_at_str}")
    print(f"Duration:         {duration_seconds} seconds")
    print("-" * 70)
    print("RESULTS SUMMARY")
    print("-" * 70)
    print(f"  Before (repository_before):")
    print(f"    Total: {before_results['summary']['total']}, "
          f"Passed: {before_results['summary']['passed']}, "
          f"Failed: {before_results['summary']['failed']}")
    print(f"  After (repository_after):")
    print(f"    Total: {after_results['summary']['total']}, "
          f"Passed: {after_results['summary']['passed']}, "
          f"Failed: {after_results['summary']['failed']}")
    print("-" * 70)
    print(f"Overall Status:   {'✓ SUCCESS' if overall_success else '✗ FAILURE'}")
    if error:
        print(f"Error:            {error}")
    print(f"Report Location:  {report_path}")
    print("=" * 70)
    
    # Print detailed after test output
    if after_results.get('stdout') or after_results.get('stderr'):
        print("\nDETAILED TEST OUTPUT (repository_after):")
        print("-" * 70)
        if after_results.get('stdout'):
            print(after_results['stdout'])
        if after_results.get('stderr'):
            print(after_results['stderr'])
    
    # Exit with appropriate code
    sys.exit(0 if overall_success else 1)


if __name__ == "__main__":
    run_evaluation()