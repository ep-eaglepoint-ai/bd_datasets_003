#!/usr/bin/env python3
"""
Evaluation script to run before and after tests and generate a JSON report.
"""
import json
import subprocess
import sys
import os
import platform
import uuid
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).parent.parent
REPORTS_DIR = ROOT / "evaluation" / "reports"

# Ensure reports directory exists
REPORTS_DIR.mkdir(parents=True, exist_ok=True)


def get_environment_info():
    """Get environment information."""
    return {
        "python_version": sys.version.split()[0],
        "platform": platform.platform(),
        "arch": platform.machine(),
        "cpus": os.cpu_count(),
    }


def run_tests(repo_path):
    """
    Runs the pytest test suite with a specific REPO_PATH environment variable.
    """
    env = os.environ.copy()
    env["CI"] = "true"
    env["REPO_PATH"] = repo_path  # Dynamically set which folder to test

    cmd = ["pytest", "tests/test_rmsnorm.py", "--json-report", "--json-report-file=/tmp/pytest-report.json", "-v"]

    try:
        result = subprocess.run(
            cmd,
            cwd=ROOT,
            env=env,
            capture_output=True,
            text=True,
            timeout=300,
        )

        passed = result.returncode == 0
        output_details = result.stderr or result.stdout
        json_output = None

        # Attempt to parse pytest JSON output if available
        try:
            # Try to read pytest JSON report if plugin is available
            json_report_path = Path("/tmp/pytest-report.json")
            if json_report_path.exists():
                with open(json_report_path, "r") as f:
                    json_output = json.load(f)
                    passed = json_output.get("exitcode", result.returncode) == 0
                    output_details = "All tests passed." if passed else (result.stderr or "Tests failed")
        except Exception as e:
            # Fallback: parse stdout for test summary
            import re
            summary_pattern = r'(\d+)\s+passed.*?(\d+)\s+failed'
            match = re.search(summary_pattern, result.stdout, re.IGNORECASE)
            if match:
                passed_count = int(match.group(1))
                failed_count = int(match.group(2))
                passed = failed_count == 0
                output_details = f"{passed_count} passed, {failed_count} failed" if not passed else "All tests passed."
            else:
                # Check for "passed" without failures
                if re.search(r'(\d+)\s+passed(?!.*failed)', result.stdout, re.IGNORECASE):
                    passed = True
                    output_details = "All tests passed."
                else:
                    output_details = result.stderr or result.stdout or "Tests failed"

        return {
            "passed": passed,
            "return_code": result.returncode,
            "output": output_details[:500] if len(output_details) > 500 else output_details,  # Truncate if too long
        }
    except subprocess.TimeoutExpired:
        return {
            "passed": False,
            "return_code": -1,
            "output": "Test execution timed out",
        }
    except Exception as e:
        return {
            "passed": False,
            "return_code": -1,
            "output": str(e),
        }


def run_evaluation():
    """Main evaluation function."""
    run_id = str(uuid.uuid4())
    start_time = datetime.now()
    start_time_iso = start_time.isoformat()

    print(f"Starting evaluation (Run ID: {run_id})...")

    # 1. Run Tests against "repository_before" (Baseline)
    # We assume this might fail because the original code doesn't have the implementation
    print("Running baseline tests (before)...")
    before_result = run_tests("repository_before")

    # 2. Run Tests against "repository_after" (Refactor)
    print("Running refactor tests (after)...")
    after_result = run_tests("repository_after")

    end_time = datetime.now()
    end_time_iso = end_time.isoformat()
    duration_seconds = (end_time - start_time).total_seconds()

    # 3. Generate Comparison Summary
    improvement_summary = "No improvement detected."
    if not before_result["passed"] and after_result["passed"]:
        improvement_summary = "Refactor fixed failing tests and met requirements."
    elif before_result["passed"] and after_result["passed"]:
        improvement_summary = "Tests passed in both states (Verify baseline expectation)."
    elif not after_result["passed"]:
        improvement_summary = "Refactored code failed to pass requirements."

    # 4. Construct the Final Report Object
    report = {
        "run_id": run_id,
        "started_at": start_time_iso,
        "finished_at": end_time_iso,
        "duration_seconds": duration_seconds,
        "environment": get_environment_info(),
        "before": {
            "tests": {
                "passed": before_result["passed"],
                "return_code": before_result["return_code"],
                "output": before_result["output"],
            },
            "metrics": {},  # Placeholders for future metrics (e.g. memory usage)
        },
        "after": {
            "tests": {
                "passed": after_result["passed"],
                "return_code": after_result["return_code"],
                "output": after_result["output"],
            },
            "metrics": {},
        },
        "comparison": {
            "passed_gate": after_result["passed"],
            "improvement_summary": improvement_summary,
        },
        "success": after_result["passed"],
        "error": None,
    }

    # Write the report to disk
    report_path = REPORTS_DIR / "report.json"
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)

    print(f"Evaluation complete. Success: {report['success']}")
    print(f"Report written to: {report_path}")

    # Exit with status code based on the 'After' result
    sys.exit(0 if report["success"] else 1)


if __name__ == "__main__":
    run_evaluation()
