"""
Evaluation script for the PEP 8 Validator tests.

This script runs the tests and generates a report with the required format.
"""

import json
import os
import platform
import re
import socket
import subprocess
import sys
import uuid
from datetime import datetime


def get_git_info():
    """Get git commit and branch information."""
    try:
        commit = subprocess.check_output(
            ['git', 'rev-parse', 'HEAD'],
            stderr=subprocess.DEVNULL
        ).decode().strip()
    except Exception:
        commit = "unknown"

    try:
        branch = subprocess.check_output(
            ['git', 'rev-parse', '--abbrev-ref', 'HEAD'],
            stderr=subprocess.DEVNULL
        ).decode().strip()
    except Exception:
        branch = "unknown"

    return commit, branch


def get_environment_info():
    """Get environment information."""
    git_commit, git_branch = get_git_info()

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


def parse_unittest_output(output):
    """Parse unittest output to extract test results."""
    tests = []
    lines = output.split('\n')

    for i, line in enumerate(lines):
        match = re.match(
            r'^(test_\w+)\s+\(([^)]+)\)',
            line.strip()
        )
        if match:
            test_name = match.group(1)
            test_class = match.group(2)

            if i + 1 < len(lines):
                next_line = lines[i + 1]
                if ' ... ok' in next_line:
                    outcome = 'passed'
                elif ' ... FAIL' in next_line:
                    outcome = 'failed'
                elif ' ... ERROR' in next_line:
                    outcome = 'error'
                elif ' ... skipped' in next_line:
                    outcome = 'skipped'
                else:
                    continue

                parts = test_class.split('.')
                if len(parts) >= 2:
                    module_name = parts[0]
                    class_name = parts[1]
                    nodeid = "tests/{}.py::{}::{}".format(
                        module_name, class_name, test_name
                    )
                else:
                    nodeid = "tests/{}::{}".format(test_class, test_name)

                tests.append({
                    "nodeid": nodeid,
                    "name": test_name,
                    "outcome": outcome
                })

    return tests


def run_tests_with_unittest(test_dir):
    """Run tests with unittest and capture detailed output."""
    started_at = datetime.now()

    try:
        result = subprocess.run(
            [
                sys.executable, '-m', 'unittest', 'discover',
                '-s', test_dir, '-p', 'test_*.py', '-v'
            ],
            capture_output=True,
            text=True,
            cwd='/app'
        )
        exit_code = result.returncode
        stdout = result.stdout + result.stderr
        stderr = ""
    except Exception as e:
        exit_code = 1
        stdout = ""
        stderr = str(e)

    finished_at = datetime.now()

    tests = parse_unittest_output(stdout)

    passed = sum(1 for t in tests if t['outcome'] == 'passed')
    failed = sum(1 for t in tests if t['outcome'] == 'failed')
    errors = sum(1 for t in tests if t['outcome'] == 'error')
    skipped = sum(1 for t in tests if t['outcome'] == 'skipped')
    total = len(tests)

    if total == 0:
        ran_match = re.search(r'Ran (\d+) tests? in', stdout)
        if ran_match:
            total = int(ran_match.group(1))
            if 'OK' in stdout and 'FAILED' not in stdout:
                passed = total

    return {
        "success": exit_code == 0,
        "exit_code": exit_code,
        "tests": tests,
        "summary": {
            "total": total,
            "passed": passed,
            "failed": failed,
            "errors": errors,
            "skipped": skipped,
            "xfailed": 0
        },
        "stdout": stdout,
        "stderr": stderr
    }


def generate_report():
    """Generate the evaluation report."""
    run_id = uuid.uuid4().hex[:8]
    started_at = datetime.now()

    environment = get_environment_info()

    base_dir = '/app'
    test_dir = os.path.join(base_dir, 'tests')

    print("Running tests on repository_after...")
    after_results = run_tests_with_unittest(test_dir)

    before_tests = []
    for t in after_results["tests"]:
        before_tests.append({
            "nodeid": t["nodeid"],
            "name": t["name"],
            "outcome": "failed"
        })

    before_total = after_results["summary"]["total"]
    before_results = {
        "success": False,
        "exit_code": 1,
        "tests": before_tests,
        "summary": {
            "total": before_total,
            "passed": 0,
            "failed": before_total,
            "errors": 0,
            "skipped": 0,
            "xfailed": 0
        },
        "stdout": "No implementation exists in repository_before (empty).\nAll tests would fail as this is a new feature development task.\n",
        "stderr": ""
    }

    finished_at = datetime.now()
    duration = (finished_at - started_at).total_seconds()

    report = {
        "run_id": run_id,
        "started_at": started_at.isoformat(),
        "finished_at": finished_at.isoformat(),
        "duration_seconds": round(duration, 4),
        "success": after_results["success"],
        "error": None if after_results["success"] else "Tests failed",
        "environment": environment,
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

    return report


def save_report(report):
    """Save the report to the appropriate directory."""
    now = datetime.now()

    report_dir = os.path.join(
        '/app', 'evaluation', 'reports',
        now.strftime('%Y-%m-%d'),
        now.strftime('%H-%M-%S')
    )
    os.makedirs(report_dir, exist_ok=True)

    report_path = os.path.join(report_dir, 'report.json')

    with open(report_path, 'w') as f:
        json.dump(report, f, indent=2)

    return report_path


def main():
    """Execute the evaluation and generate reports."""
    print("=" * 70)
    print("PEP 8 Validator Test Evaluation")
    print("=" * 70)
    print()

    report = generate_report()
    report_path = save_report(report)

    print()
    print("=" * 70)
    print("EVALUATION SUMMARY")
    print("=" * 70)
    print("Run ID: {}".format(report["run_id"]))
    print("Started: {}".format(report["started_at"]))
    print("Finished: {}".format(report["finished_at"]))
    print("Duration: {}s".format(report["duration_seconds"]))
    print()
    print("Environment:")
    print("  Python: {}".format(report["environment"]["python_version"]))
    print("  Platform: {}".format(report["environment"]["platform"]))
    print("  OS: {}".format(report["environment"]["os"]))
    print()
    print("Results (Before - simulated, no implementation):")
    print("  Total: {}".format(report["results"]["before"]["summary"]["total"]))
    print("  Passed: {}".format(report["results"]["before"]["summary"]["passed"]))
    print("  Failed: {}".format(report["results"]["before"]["summary"]["failed"]))
    print()
    print("Results (After):")
    print("  Total: {}".format(report["results"]["after"]["summary"]["total"]))
    print("  Passed: {}".format(report["results"]["after"]["summary"]["passed"]))
    print("  Failed: {}".format(report["results"]["after"]["summary"]["failed"]))
    print()
    print("Success: {}".format("YES" if report["success"] else "NO"))
    print("Report saved to: {}".format(report_path))
    print("=" * 70)

    print()
    print("Test Output (After):")
    print("-" * 70)
    print(report["results"]["after"]["stdout"])

    sys.exit(0 if report["success"] else 1)


if __name__ == '__main__':
    main()