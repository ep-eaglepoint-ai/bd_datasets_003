#!/usr/bin/env python3
"""
Evaluation runner for Advanced Spectral Normalization System.
"""
import os
import sys
import json
import uuid
import platform
import subprocess
from datetime import datetime
from pathlib import Path


def generate_run_id():
    return uuid.uuid4().hex[:8]


def get_git_info():
    git_info = {"git_commit": "unknown", "git_branch": "unknown"}
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            git_info["git_commit"] = result.stdout.strip()[:8]
    except Exception:
        pass

    try:
        result = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            git_info["git_branch"] = result.stdout.strip()
    except Exception:
        pass

    return git_info


def get_environment_info():
    git_info = get_git_info()
    return {
        "python_version": platform.python_version(),
        "platform": platform.platform(),
        "os": platform.system(),
        "os_release": platform.release(),
        "architecture": platform.machine(),
        "hostname": platform.node(),
        "git_commit": git_info["git_commit"],
        "git_branch": git_info["git_branch"],
    }


def run_pytest_with_pythonpath(pythonpath, tests_dir, label):
    print(f"\n{'=' * 60}")
    print(f"RUNNING TESTS: {label.upper()}")
    print(f"{'=' * 60}")
    print(f"PYTHONPATH: {pythonpath}")
    print(f"Tests directory: {tests_dir}")

    cmd = [
        sys.executable, "-m", "pytest",
        str(tests_dir), "-v", "--tb=short",
    ]

    env = os.environ.copy()
    env["PYTHONPATH"] = pythonpath

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            cwd=str(Path(tests_dir).parent),
            env=env,
            timeout=300
        )

        stdout = result.stdout
        stderr = result.stderr

        tests = parse_pytest_verbose_output(stdout)

        passed = sum(1 for t in tests if t.get("outcome") == "passed")
        failed = sum(1 for t in tests if t.get("outcome") == "failed")
        errors = sum(1 for t in tests if t.get("outcome") == "error")
        skipped = sum(1 for t in tests if t.get("outcome") == "skipped")
        total = len(tests)

        print(f"\nResults: {passed} passed, {failed} failed, {errors} errors, {skipped} skipped (total: {total})")

        for test in tests:
            status_icon = {
                "passed": "PASS", "failed": "FAIL",
                "error": "ERR", "skipped": "SKIP"
            }.get(test.get("outcome"), "?")
            print(f"  [{status_icon}] {test.get('nodeid', 'unknown')}")

        return {
            "success": result.returncode == 0,
            "exit_code": result.returncode,
            "tests": tests,
            "summary": {
                "total": total, "passed": passed,
                "failed": failed, "errors": errors, "skipped": skipped,
            },
            "stdout": stdout[-3000:] if len(stdout) > 3000 else stdout,
            "stderr": stderr[-1000:] if len(stderr) > 1000 else stderr,
        }

    except subprocess.TimeoutExpired:
        print("TIMEOUT: Test execution timed out")
        return {
            "success": False, "exit_code": -1, "tests": [],
            "summary": {"error": "Test execution timed out"},
            "stdout": "", "stderr": "",
        }
    except Exception as e:
        print(f"ERROR running tests: {e}")
        return {
            "success": False, "exit_code": -1, "tests": [],
            "summary": {"error": str(e)},
            "stdout": "", "stderr": "",
        }


def parse_pytest_verbose_output(output):
    tests = []
    lines = output.split('\n')

    for line in lines:
        line_stripped = line.strip()

        if '::' in line_stripped:
            outcome = None
            if ' PASSED' in line_stripped:
                outcome = "passed"
            elif ' FAILED' in line_stripped:
                outcome = "failed"
            elif ' ERROR' in line_stripped:
                outcome = "error"
            elif ' SKIPPED' in line_stripped:
                outcome = "skipped"

            if outcome:
                for status_word in [' PASSED', ' FAILED', ' ERROR', ' SKIPPED']:
                    if status_word in line_stripped:
                        nodeid = line_stripped.split(status_word)[0].strip()
                        break

                tests.append({
                    "nodeid": nodeid,
                    "name": nodeid.split("::")[-1] if "::" in nodeid else nodeid,
                    "outcome": outcome,
                })

    return tests


def run_evaluation():
    print(f"\n{'=' * 60}")
    print("SPECTRAL NORMALIZATION EVALUATION")
    print(f"{'=' * 60}")

    project_root = Path(__file__).parent.parent
    tests_dir = project_root / "tests"

    before_pythonpath = str(project_root / "repository_before")
    after_pythonpath = str(project_root / "repository_after")

    before_results = run_pytest_with_pythonpath(
        before_pythonpath, tests_dir, "before (repository_before)"
    )

    after_results = run_pytest_with_pythonpath(
        after_pythonpath, tests_dir, "after (repository_after)"
    )

    comparison = {
        "before_tests_passed": before_results.get("success", False),
        "after_tests_passed": after_results.get("success", False),
        "before_total": before_results.get("summary", {}).get("total", 0),
        "before_passed": before_results.get("summary", {}).get("passed", 0),
        "before_failed": before_results.get("summary", {}).get("failed", 0),
        "after_total": after_results.get("summary", {}).get("total", 0),
        "after_passed": after_results.get("summary", {}).get("passed", 0),
        "after_failed": after_results.get("summary", {}).get("failed", 0),
    }

    print(f"\n{'=' * 60}")
    print("EVALUATION SUMMARY")
    print(f"{'=' * 60}")

    print(f"\nBefore Implementation (repository_before):")
    print(f"  Overall: {'PASSED' if before_results.get('success') else 'FAILED'}")
    print(f"  Tests: {comparison['before_passed']}/{comparison['before_total']} passed")

    print(f"\nAfter Implementation (repository_after):")
    print(f"  Overall: {'PASSED' if after_results.get('success') else 'FAILED'}")
    print(f"  Tests: {comparison['after_passed']}/{comparison['after_total']} passed")

    print(f"\n{'=' * 60}")
    print("EXPECTED BEHAVIOR CHECK")
    print(f"{'=' * 60}")

    if not before_results.get("success"):
        print("Before implementation: Tests failed (expected - repository is empty)")
    else:
        print("Before implementation: Tests passed (unexpected)")

    if after_results.get("success"):
        print("After implementation: All tests passed (expected)")
    else:
        print("After implementation: Some tests failed (unexpected - should pass all)")

    return {
        "before": before_results,
        "after": after_results,
        "comparison": comparison,
    }


def generate_output_path():
    now = datetime.now()
    date_str = now.strftime("%Y-%m-%d")
    time_str = now.strftime("%H-%M-%S")

    project_root = Path(__file__).parent.parent
    output_dir = project_root / "evaluation" / date_str / time_str
    output_dir.mkdir(parents=True, exist_ok=True)

    return output_dir / "report.json"


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Run spectral normalization evaluation")
    parser.add_argument("--output", type=str, default=None,
                        help="Output JSON file path (default: evaluation/YYYY-MM-DD/HH-MM-SS/report.json)")
    args = parser.parse_args()

    run_id = generate_run_id()
    started_at = datetime.now()

    print(f"Run ID: {run_id}")
    print(f"Started at: {started_at.isoformat()}")

    try:
        results = run_evaluation()
        success = results["after"].get("success", False)
        error_message = None if success else "After implementation tests failed"
    except Exception as e:
        import traceback
        print(f"\nERROR: {str(e)}")
        traceback.print_exc()
        results = None
        success = False
        error_message = str(e)

    finished_at = datetime.now()
    duration = (finished_at - started_at).total_seconds()

    environment = get_environment_info()

    report = {
        "run_id": run_id,
        "started_at": started_at.isoformat(),
        "finished_at": finished_at.isoformat(),
        "duration_seconds": round(duration, 6),
        "success": success,
        "error": error_message,
        "environment": environment,
        "results": results,
    }

    if args.output:
        output_path = Path(args.output)
    else:
        output_path = generate_output_path()

    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "w") as f:
        json.dump(report, f, indent=2)
    print(f"\nReport saved to: {output_path}")

    print(f"\n{'=' * 60}")
    print(f"EVALUATION COMPLETE")
    print(f"{'=' * 60}")
    print(f"Run ID: {run_id}")
    print(f"Duration: {duration:.2f}s")
    print(f"Success: {'YES' if success else 'NO'}")

    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
