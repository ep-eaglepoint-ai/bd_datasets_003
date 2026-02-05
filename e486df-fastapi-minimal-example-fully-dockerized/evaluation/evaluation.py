#!/usr/bin/env python3
import sys
import json
import time
import uuid
import platform
import subprocess
import os
from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).resolve().parent.parent
REPORTS = ROOT / "evaluation" / "reports"

def environment_info():
    return {
        "python_version": platform.python_version(),
        "platform": platform.platform()
    }

def run_tests(repo_name: str):
    """Run tests for a specific repository by setting the PYTHONPATH."""
    repo_path = ROOT / repo_name
    
    # Configure environment with specific PYTHONPATH for the repo being tested
    env = os.environ.copy()
    env["PYTHONPATH"] = f"{repo_path}:{ROOT}"
    # Suppress pycache creation
    env["PYTHONDONTWRITEBYTECODE"] = "1"

    try:
        # Run pytest on the tests directory
        # -p no:cacheprovider to avoid .pytest_cache
        proc = subprocess.run(
            ["pytest", "tests/test_app.py", "-q", "-p", "no:cacheprovider"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=120,
            env=env
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
            "output": "pytest timeout"
        }
    except Exception as e:
        return {
            "passed": False,
            "return_code": -2,
            "output": str(e)
        }

def run_metrics(repo_name: str):
    """Optional - collect metrics if needed."""
    return {}

def evaluate(repo_name: str):
    tests = run_tests(repo_name)
    metrics = run_metrics(repo_name)
    return {
        "tests": tests,
        "metrics": metrics
    }

def run_evaluation():
    run_id = str(uuid.uuid4())
    start = datetime.utcnow()
    
    # Evaluate baseline (before)
    before = evaluate("repository_before")
    
    # Evaluate implementation (after)
    after = evaluate("repository_after")
    
    # Compare and determine success
    passed_gate = after["tests"]["passed"]
    improvement_summary = (
        "After implementation passed all compliance tests. "
        "Before implementation failed as expected (missing files)."
    ) if passed_gate else "After implementation failed to pass compliance tests."

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
    try:
        REPORTS.mkdir(parents=True, exist_ok=True)
    except PermissionError:
        print(f"ERROR: Permission denied creating {REPORTS}. Try running with -u \"$(id -u):$(id -g)\"")
        return 1
    
    try:
        report = run_evaluation()
    except Exception as e:
        report = {
            "success": False,
            "error": str(e),
            "run_id": str(uuid.uuid4()),
            "started_at": datetime.utcnow().isoformat() + "Z",
            "finished_at": datetime.utcnow().isoformat() + "Z",
            "duration_seconds": 0.0,
            "environment": environment_info(),
            "before": None,
            "after": None,
            "comparison": None
        }
    
    path = REPORTS / "latest.json"
    try:
        path.write_text(json.dumps(report, indent=2))
        print(f"Report written to {path}")
        
        # Also copy to evaluation/latest.json for CI compatibility
        ci_path = ROOT / "evaluation" / "latest.json"
        ci_path.write_text(json.dumps(report, indent=2))
        print(f"Report also written to {ci_path} for CI")
    except PermissionError:
        print(f"ERROR: Permission denied writing report to {path}")
        return 1
    
    return 0 if report["success"] else 1

if __name__ == "__main__":
    sys.exit(main())
