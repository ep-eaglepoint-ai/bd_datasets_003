#!/usr/bin/env python3
"""
Evaluation script for EZCRJN - Customer Activity Feature Module.

This script compares the behavior of:
- repository_before/
- repository_after/

According to the task instructions, there is effectively no meaningful
implementation in repository_before, so we:
- Do NOT run tests against repository_before
- Instead, record a synthetic failed test result with a clear message:
  "no test to run against repository_before"

For repository_after, we run the real correctness tests using pytest
with the --repo after flag.
"""

import json
import platform
import subprocess
import sys
import uuid
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
EVAL_DIR = ROOT / "evaluation"
REPORTS_DIR = EVAL_DIR / "reports"


def environment_info() -> dict:
    """Collect basic environment information."""
    return {
        "python_version": platform.python_version(),
        "platform": platform.platform(),
    }


def run_tests_for_after() -> dict:
    """
    Run pytest for repository_after.

    This uses the existing test suite and explicitly targets repository_after
    via the --repo flag.
    """
    try:
        proc = subprocess.run(
            ["pytest", "tests", "-q", "--repo", "after"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=300,
        )
        output = (proc.stdout or "") + (proc.stderr or "")
        return {
            "passed": proc.returncode == 0,
            "return_code": proc.returncode,
            "output": output[:8000],  # truncate to keep report manageable
        }
    except subprocess.TimeoutExpired:
        return {
            "passed": False,
            "return_code": -1,
            "output": "pytest timeout when running tests against repository_after",
        }


def run_tests(repo_name: str) -> dict:
    """
    Run correctness tests for the given repository name.

    Special behavior per task instructions:
    - repository_before: do NOT run tests, return a synthetic failed result
      with a clear message.
    - repository_after: run the real pytest test suite.
    """
    if repo_name == "repository_before":
        return {
            "passed": False,
            "return_code": 1,
            "output": "no test to run against repository_before",
        }

    if repo_name == "repository_after":
        return run_tests_for_after()

    # Fallback for unexpected repo names: treat as no tests
    return {
        "passed": False,
        "return_code": 1,
        "output": f"no test configuration for {repo_name}",
    }


def run_metrics(repo_path: Path) -> dict:
    """
    Optional metrics collection.

    For this task we do not collect additional metrics, but the function
    is kept for future extensibility and to comply with the standard
    evaluation interface.
    """
    # Metrics must be JSON-serializable numbers / booleans only if added.
    return {}


def evaluate(repo_name: str) -> dict:
    """Evaluate a single repository (before or after)."""
    repo_path = ROOT / repo_name
    tests = run_tests(repo_name)
    metrics = run_metrics(repo_path)
    return {
        "tests": tests,
        "metrics": metrics,
    }


def run_evaluation() -> dict:
    """
    Run the full evaluation and return the report as a dictionary.

    Success rule (default): success = after.tests.passed == True
    """
    run_id = str(uuid.uuid4())
    started_at = datetime.utcnow()

    before = evaluate("repository_before")
    after = evaluate("repository_after")

    comparison = {
        "passed_gate": bool(after["tests"]["passed"]),
        "improvement_summary": (
            "repository_after tests passed; "
            "repository_before had no tests to run and is marked as failed."
        ),
    }

    finished_at = datetime.utcnow()

    report = {
        "run_id": run_id,
        "started_at": started_at.isoformat() + "Z",
        "finished_at": finished_at.isoformat() + "Z",
        "duration_seconds": (finished_at - started_at).total_seconds(),
        "environment": environment_info(),
        "before": before,
        "after": after,
        "comparison": comparison,
        "success": comparison["passed_gate"],
        "error": None,
    }

    return report


def main() -> int:
    """
    Entry point for the evaluation script.

    Writes evaluation/reports/latest.json and prints the path.
    Exit code reflects overall success.
    """
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    try:
        report = run_evaluation()
    except Exception as exc:  # pylint: disable=broad-except
        # On any crash, follow error handling rules:
        now = datetime.utcnow().isoformat() + "Z"
        error_report = {
            "run_id": str(uuid.uuid4()),
            "started_at": now,
            "finished_at": now,
            "duration_seconds": 0.0,
            "environment": environment_info(),
            "before": {
                "tests": {
                    "passed": False,
                    "return_code": 1,
                    "output": "evaluation crashed before running tests",
                },
                "metrics": {},
            },
            "after": {
                "tests": {
                    "passed": False,
                    "return_code": 1,
                    "output": "evaluation crashed before running tests",
                },
                "metrics": {},
            },
            "comparison": {
                "passed_gate": False,
                "improvement_summary": "evaluation crashed",
            },
            "success": False,
            "error": str(exc),
        }
        REPORTS_DIR.mkdir(parents=True, exist_ok=True)
        latest_path = REPORTS_DIR / "latest.json"
        latest_path.write_text(json.dumps(error_report, indent=2))
        print(f"Report written to {latest_path}")
        return 1

    latest_path = REPORTS_DIR / "latest.json"
    latest_path.write_text(json.dumps(report, indent=2))
    print(f"Report written to {latest_path}")
    return 0 if report.get("success") else 1


if __name__ == "__main__":
    sys.exit(main())


