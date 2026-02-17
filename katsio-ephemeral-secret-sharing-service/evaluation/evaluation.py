import json
import os
import platform
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional


PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO_BEFORE = os.path.join(PROJECT_ROOT, "repository_before")
REPO_AFTER = os.path.join(PROJECT_ROOT, "repository_after")
TESTS_DIR = os.path.join(PROJECT_ROOT, "tests")
REPORTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "reports")


def iso_now() -> str:
    """Return current UTC time in ISO 8601 format."""
    return datetime.now(timezone.utc).isoformat()


def collect_environment() -> Dict[str, Any]:
    """Collect basic environment metadata for the report."""
    return {
        # Keep the example key name but fill with Python version
        "node_version": platform.python_version(),
        "platform": platform.system().lower(),
        "arch": platform.machine(),
        "cpus": os.cpu_count() or 1,
    }


def _run_pytest_for_repo(repo_path: Optional[str]) -> Dict[str, Any]:
    """
    Run pytest against tests/ with an optional repo path added to PYTHONPATH.

    This is used for both the 'before' and 'after' runs.
    """
    env = os.environ.copy()

    pythonpath_parts = []
    if repo_path and os.path.isdir(repo_path):
        pythonpath_parts.append(repo_path)

    # Ensure project root is also on PYTHONPATH so imports like `repository_after.*` work.
    pythonpath_parts.append(PROJECT_ROOT)

    existing = env.get("PYTHONPATH")
    if existing:
        pythonpath_parts.append(existing)

    env["PYTHONPATH"] = os.pathsep.join(pythonpath_parts)

    cmd = [
        sys.executable,
        "-m",
        "pytest",
        "-q",
        os.path.relpath(TESTS_DIR, PROJECT_ROOT),
    ]

    start = time.perf_counter()
    proc = subprocess.run(
        cmd,
        cwd=PROJECT_ROOT,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    duration = time.perf_counter() - start

    output = proc.stdout or ""
    # Truncate extremely long output to keep report manageable
    max_len = 20000
    if len(output) > max_len:
        output = output[:max_len] + "\n...[truncated]..."

    return {
        "passed": proc.returncode == 0,
        "return_code": proc.returncode,
        "output": output,
        "duration_seconds": round(duration, 3),
    }


def build_report() -> Dict[str, Any]:
    """Run before/after test suites and construct the evaluation report."""
    run_id = str(uuid.uuid4())
    started_at = iso_now()

    before_tests = _run_pytest_for_repo(REPO_BEFORE)
    after_tests = _run_pytest_for_repo(REPO_AFTER)

    finished_at = iso_now()

    total_duration = before_tests.get("duration_seconds", 0.0) + after_tests.get(
        "duration_seconds", 0.0
    )

    comparison = {
        "passed_gate": bool(after_tests["passed"]),
        "improvement_summary": (
            "Refactor fixed failing tests and met ephemeral secret sharing requirements."
            if after_tests["passed"]
            else "Refactor did not pass all tests."
        ),
    }

    report: Dict[str, Any] = {
        "run_id": run_id,
        "started_at": started_at,
        "finished_at": finished_at,
        "duration_seconds": round(total_duration, 3),
        "environment": collect_environment(),
        "before": {
            "tests": {
                "passed": before_tests["passed"],
                "return_code": before_tests["return_code"],
                "output": before_tests["output"],
            },
            "metrics": {},
        },
        "after": {
            "tests": {
                "passed": after_tests["passed"],
                "return_code": after_tests["return_code"],
                "output": after_tests["output"],
            },
            "metrics": {},
        },
        "comparison": comparison,
        "success": bool(after_tests["passed"]),
        "error": None,
    }

    return report


def main() -> None:
    os.makedirs(REPORTS_DIR, exist_ok=True)
    report = build_report()
    filename = "reports.json"
    path = os.path.join(REPORTS_DIR, filename)

    with open(path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    print(f"Evaluation report written to {path}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # pragma: no cover
        # Fallback minimal error report so the pipeline still has something to inspect.
        os.makedirs(REPORTS_DIR, exist_ok=True)
        fallback_id = str(uuid.uuid4())
        path = os.path.join(REPORTS_DIR, f"{fallback_id}.json")
        error_report = {
            "run_id": fallback_id,
            "started_at": iso_now(),
            "finished_at": iso_now(),
            "duration_seconds": 0.0,
            "environment": collect_environment(),
            "before": {
                "tests": {
                    "passed": False,
                    "return_code": 1,
                    "output": "",
                },
                "metrics": {},
            },
            "after": {
                "tests": {
                    "passed": False,
                    "return_code": 1,
                    "output": "",
                },
                "metrics": {},
            },
            "comparison": {
                "passed_gate": False,
                "improvement_summary": "Evaluation script failed before tests could complete.",
            },
            "success": False,
            "error": str(exc),
        }
        with open(path, "w", encoding="utf-8") as f:
            json.dump(error_report, f, indent=2)
        print(f"Evaluation failed, error report written to {path}", file=sys.stderr)
        raise
