#!/usr/bin/env python3
import sys
import json
import uuid
import platform
import subprocess
import os
from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).resolve().parent.parent
REPORTS = ROOT / "evaluation" / "reports"

def environment_info():
    """Collect environment metadata."""
    return {
        "python_version": platform.python_version(),
        "platform": platform.platform()
    }

def run_tests_for_repo(repo_name: str):
    """
    Run tests against a specific repository.

    Args:
        repo_name: Either "repository_before" or "repository_after"

    Returns:
        dict with keys: passed (bool), return_code (int), output (str)
    """
    try:
        proc = subprocess.run(
            ["pytest", "tests", "-v", "--tb=short"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=120,
            env={**os.environ, "REPO_UNDER_TEST": repo_name}
        )

        return {
            "passed": proc.returncode == 0,
            "return_code": proc.returncode,
            "output": (proc.stdout + proc.stderr)[:8000]
        }
    except subprocess.TimeoutExpired:
        return {
            "passed": False,
            "return_code": -1,
            "output": "Test execution timeout after 120 seconds"
        }
    except Exception as e:
        return {
            "passed": False,
            "return_code": -1,
            "output": f"Test execution error: {str(e)}"
        }

def run_metrics(repo_path: Path):
    """
    Optional: Collect performance metrics.

    Implement this if your task requires performance measurements.
    Otherwise, return an empty dict.
    """
    return {}

def evaluate(repo_name: str):
    """Evaluate a single repository."""
    repo_path = ROOT / repo_name

    # Check if repository exists and has actual code
    if not repo_path.exists():
        return {
            "tests": {
                "passed": False,
                "return_code": -1,
                "output": f"Repository {repo_name} does not exist"
            },
            "metrics": {}
        }

    # Check if repository is empty (only .gitkeep or __pycache__)
    contents = list(repo_path.glob("*"))
    has_code = any(
        f.name not in ['.gitkeep', '__pycache__', '.git']
        for f in contents
    )

    if not has_code:
        return {
            "tests": {
                "passed": False,
                "return_code": -1,
                "output": f"Repository {repo_name} is empty"
            },
            "metrics": {}
        }

    tests = run_tests_for_repo(repo_name)
    metrics = run_metrics(repo_path)

    return {
        "tests": tests,
        "metrics": metrics
    }

def run_evaluation():
    """Main evaluation function."""
    run_id = str(uuid.uuid4())
    start = datetime.utcnow()

    # Evaluate both repositories
    before = evaluate("repository_before")
    after = evaluate("repository_after")

    # Determine success
    passed_gate = after["tests"]["passed"]

    # Generate comparison summary
    if passed_gate:
        if before["tests"]["passed"]:
            improvement_summary = "Both before and after pass all tests (regression verification)."
        else:
            improvement_summary = "After implementation passes all tests while before fails as expected."
    else:
        improvement_summary = "After implementation still has failing tests."

    end = datetime.utcnow()

    return {
        "run_id": run_id,
        "started_at": start.isoformat() + "Z",
        "finished_at": end.isoformat() + "Z",
        "duration_seconds": (end - start).total_seconds(),
        "environment": environment_info(),
        "before": before,
        "after": after,
        "comparison": {
            "passed_gate": passed_gate,
            "improvement_summary": improvement_summary
        },
        "success": passed_gate,
        "error": None
    }

def main():
    """Entry point with proper report generation."""
    now = datetime.now()
    date_str = now.strftime("%Y-%m-%d")
    time_str = now.strftime("%H-%M-%S")

    output_dir = REPORTS / date_str / time_str
    output_dir.mkdir(parents=True, exist_ok=True)

    report = run_evaluation()
    path = output_dir / "report.json"

    path.write_text(json.dumps(report, indent=2))
    print(f"Report written to {path}")

    return 0 if report["success"] else 1

if __name__ == "__main__":
    sys.exit(main())
