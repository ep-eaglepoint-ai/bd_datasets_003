import os
import sys
import json
import subprocess
import re
from datetime import datetime
import uuid
import platform

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
REPORTS = os.path.join(ROOT, "evaluation", "reports")

def environment_info():
    return {
        "python": sys.version,
        "platform": platform.platform(),
    }

def strip_ansi(text):
    ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
    return ansi_escape.sub('', text)

def parse_test_output(output):
    passed = 0
    failed = 0
    skipped = 0

    clean_output = strip_ansi(output)
    lines = clean_output.split('\n')

    # Look for pytest summary line
    for line in lines:
        # Check if line looks like a summary line (contains passed, failed, skipped, tests, or error)
        if any(key in line for key in ['passed', 'failed', 'skipped', 'error', 'tests']):
            # Example: "5 passed, 2 failed, 1 skipped" or "10 passed"
            passed_match = re.search(r'(\d+)\s+passed', line)
            if passed_match:
                passed = int(passed_match.group(1))

            failed_match = re.search(r'(\d+)\s+failed', line)
            if failed_match:
                failed = int(failed_match.group(1))
            
            error_match = re.search(r'(\d+)\s+error', line)
            if error_match:
                # Treat errors during collection as failures
                failed += int(error_match.group(1))

            skipped_match = re.search(r'(\d+)\s+skipped', line)
            if skipped_match:
                skipped = int(skipped_match.group(1))
            
            # If we found any stats, we assume this is the summary line and stop
            if passed_match or failed_match or error_match or skipped_match:
                break

    return passed, failed, skipped

def run_tests(repo_type):
    repo_path = os.path.join(ROOT, f"repository_{repo_type}")

    # Set PYTHONPATH to the repository
    env = os.environ.copy()
    env['PYTHONPATH'] = repo_path

    try:
        result = subprocess.run(
            [sys.executable, "-m", "pytest", "-q", "tests/"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=300,
            env=env
        )

        output = result.stdout + result.stderr
        passed, failed, skipped = parse_test_output(output)
        is_success = failed == 0 and passed > 0

        return {
            "passed": is_success,
            "return_code": result.returncode,
            "tests_passed": passed,
            "tests_failed": failed,
            "tests_skipped": skipped,
            "output": output[:8000],
        }
    except subprocess.TimeoutExpired:
        return {
            "passed": False,
            "return_code": -1,
            "tests_passed": 0,
            "tests_failed": 0,
            "tests_skipped": 0,
            "output": "Test execution timed out",
        }
    except Exception as e:
        return {
            "passed": False,
            "return_code": -1,
            "tests_passed": 0,
            "tests_failed": 0,
            "tests_skipped": 0,
            "output": f"Error running tests: {str(e)}",
        }

def run_metrics(repo_path):
    # Placeholder for metrics, as in JS
    return {}

def evaluate(repo_name, repo_type):
    repo_path = os.path.join(ROOT, repo_name)
    tests = run_tests(repo_type)
    metrics = run_metrics(repo_path)
    return {"tests": tests, "metrics": metrics}

def print_separator(char="=", length=70):
    print(char * length)

def print_test_summary(name, result):
    tests = result["tests"]
    status = "✅ PASS" if tests["passed"] else "❌ FAIL"
    print(f"\n{'─' * 35}")
    print(f"  {name}")
    print(f"{'─' * 35}")
    print(f"  Status:          {status}")
    print(f"  Tests Passed:    {tests['tests_passed']}")
    print(f"  Tests Failed:    {tests['tests_failed']}")
    print(f"  Tests Skipped:   {tests['tests_skipped']}")
    print(f"  Return Code:     {tests['return_code']}")

def run_evaluation():
    run_id = str(uuid.uuid4())
    start = datetime.now()

    print_separator()
    print("  ELASTIC NET REGRESSION EVALUATION")
    print_separator()

    print(f"\n  Run ID:     {run_id}")
    print(f"  Started:    {start.strftime('%Y-%m-%d %H:%M:%S')} UTC")
    print(f"  Python:     {sys.version.split()[0]}")
    print(f"  Platform:   {platform.platform()}")

    in_docker = os.path.exists("/.dockerenv") or "DOCKER_CONTAINER" in os.environ
    print(f"  Environment: {'Docker container' if in_docker else 'Host system'}")

    print(f"\n{'─' * 70}")
    print("  Running Tests...")
    print(f"{'─' * 70}")

    print("\n  [1/2] Testing repository_before (unoptimized)...")
    before = evaluate("repository_before", "before")

    print("  [2/2] Testing repository_after (optimized)...")
    after = evaluate("repository_after", "after")

    if "output" in after["tests"]:
        del after["tests"]["output"]

    comparison = {
        "before_passed": before["tests"]["passed"],
        "after_passed": after["tests"]["passed"],
        "before_failed_count": before["tests"]["tests_failed"],
        "after_failed_count": after["tests"]["tests_failed"],
        "passed_gate": after["tests"]["passed"] and not before["tests"]["passed"],
        "improvement_summary": "",
    }

    if comparison["passed_gate"]:
        comparison["improvement_summary"] = f"Optimization successful: repository_after passes all {after['tests']['tests_passed']} tests, while repository_before fails {before['tests']['tests_failed']} tests."
    elif after["tests"]["passed"] and before["tests"]["passed"]:
        comparison["improvement_summary"] = "Both pass; implementation is complete."
    else:
        comparison["improvement_summary"] = f"Failed: repository_after has {after['tests']['tests_failed']} failing tests."

    end = datetime.now()
    duration = (end - start).total_seconds()

    result = {
        "run_id": run_id,
        "started_at": start.isoformat(),
        "finished_at": end.isoformat(),
        "duration_seconds": duration,
        "environment": environment_info(),
        "before": before,
        "after": after,
        "comparison": comparison,
        "success": comparison["passed_gate"],
        "error": None,
    }

    date_str = start.strftime("%Y-%m-%d")
    time_str = start.strftime("%H-%M-%S")
    report_dir = os.path.join(REPORTS, date_str, time_str)

    try:
        os.makedirs(report_dir, exist_ok=True)
        report_path = os.path.join(report_dir, "report.json")
        with open(report_path, "w") as f:
            json.dump(result, f, indent=2)

        print(f"\n{'─' * 70}")
        print("  RESULTS SUMMARY")
        print(f"{'─' * 70}")

        print_test_summary("repository_before (unoptimized)", before)
        print_test_summary("repository_after (optimized)", after)

        print(f"\n{'─' * 70}")
        print("  COMPARISON")
        print(f"{'─' * 70}")

        gate_status = "✅ PASSED" if comparison["passed_gate"] else "❌ FAILED"
        print(f"\n  Optimization Gate:     {gate_status}")
        print(f"  Summary: {comparison['improvement_summary']}")

        print(f"\n  Report saved to: {report_path}")
        print(f"\n{'=' * 70}")
        print("  ✅ EVALUATION SUCCESSFUL ✅" if result["success"] else "  ❌ EVALUATION FAILED ❌")
        print(f"{'=' * 70}\n")

        return result
    except Exception as e:
        print(f"Error writing report: {e}")
        return {"success": False}

def main():
    try:
        run_evaluation()
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ Evaluation failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()