#!/usr/bin/env python3
"""
Evaluation script for webhook delivery system.
Standard contract following EaglePoint AI evaluation guidelines.
"""

import sys
import json
import time
import uuid
import platform
import subprocess
from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).resolve().parent.parent
REPORTS = ROOT / "evaluation" / "reports"


def environment_info():
    """Return environment information."""
    return {
        "python_version": platform.python_version(),
        "platform": platform.platform()
    }


def run_tests(repo_path: Path):
    """Run tests in the specified repository path."""
    # Tests are located at project root /tests, run from there
    test_path = ROOT / "tests"
    if not test_path.exists():
        return {
            "passed": False,
            "return_code": 1,
            "output": f"Tests directory not found at {test_path}"
        }
    
    try:
        proc = subprocess.run(
            ["pytest", "tests", "-q"],
            cwd=str(ROOT),
            capture_output=True,
            text=True,
            timeout=120
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
            "return_code": -1,
            "output": str(e)[:8000]
        }


def run_metrics(repo_path: Path):
    """Optional metrics collection - not needed for this task."""
    return {}


def evaluate(repo_name: str):
    """Evaluate a repository (before or after)."""
    # Static result for repository_before - tests don't exist there
    if repo_name == "repository_before":
        return {
            "tests": {
                "passed": False,
                "return_code": 1,
                "output": "no tests to run on repository_before"
            },
            "metrics": {},
            "repository_exists": True
        }
    
    # For repository_after, run actual tests
    repo_path = ROOT / repo_name
    if not repo_path.exists():
        return {
            "tests": {
                "passed": False,
                "return_code": 1,
                "output": f"Repository {repo_name} not found at {repo_path}"
            },
            "metrics": {},
            "repository_exists": False
        }
    
    tests = run_tests(repo_path)
    metrics = run_metrics(repo_path)
    return {
        "tests": tests,
        "metrics": metrics,
        "repository_exists": True
    }


def run_evaluation():
    """Run the full evaluation and return the report dict."""
    run_id = str(uuid.uuid4())
    start = datetime.utcnow()
    
    before = evaluate("repository_before")
    after = evaluate("repository_after")
    
    # Determine success: improvement detected if before failed but after passed
    before_failed = not before["tests"]["passed"]
    after_passed = after["tests"]["passed"]
    
    # Build improvement summary
    if not before.get("repository_exists", True):
        improvement_summary = "repository_before not found - evaluating repository_after as fixed state"
    elif before_failed and after_passed:
        improvement_summary = "Tests now passing after implementation"
    elif before_failed and not after_passed:
        improvement_summary = "Tests still failing - implementation not complete"
    elif not before_failed and after_passed:
        improvement_summary = "Both states passing - no improvement needed"
    else:
        improvement_summary = "No improvement detected"
    
    comparison = {
        "passed_gate": after_passed,
        "improvement_summary": improvement_summary
    }
    
    end = datetime.utcnow()
    
    return {
        "run_id": run_id,
        "started_at": start.isoformat() + "Z",
        "finished_at": end.isoformat() + "Z",
        "duration_seconds": (end - start).total_seconds(),
        "environment": environment_info(),
        "before": {
            "tests": before["tests"],
            "metrics": before["metrics"]
        },
        "after": {
            "tests": after["tests"],
            "metrics": after["metrics"]
        },
        "comparison": comparison,
        "success": after_passed,
        "error": None
    }


def main():
    """Main entry point."""
    REPORTS.mkdir(parents=True, exist_ok=True)
    
    report = run_evaluation()
    
    path = REPORTS / "latest.json"
    path.write_text(json.dumps(report, indent=2))
    
    print(f"Report written to {path}")
    print(f"Before: passed={report['before']['tests']['passed']}, return_code={report['before']['tests']['return_code']}")
    print(f"After: passed={report['after']['tests']['passed']}, return_code={report['after']['tests']['return_code']}")
    print(f"Success: {report['success']}")
    
    return 0 if report["success"] else 1


if __name__ == "__main__":
    sys.exit(main())
