#!/usr/bin/env python3
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
    return {
        "python_version": platform.python_version(),
        "platform": platform.platform()
    }


def run_tests(repo_name: str):
    """Run tests for the specified repository."""
    try:
        proc = subprocess.run(
            ["pytest", "tests", "--repo", repo_name, "-v"],
            cwd=ROOT,
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
            "output": f"Error running tests: {str(e)}"
        }


def run_metrics(repo_path: Path):
    """Optional metrics collection - not implemented for this task."""
    return {}


def evaluate(repo_name: str):
    """Evaluate a repository by running tests and collecting metrics."""
    repo_path = ROOT / repo_name
    
    # Check if repository exists and has implementation
    if repo_name == "repository_before":
        # Static message: no repository_before to test
        tests = {
            "passed": False,
            "return_code": 1,
            "output": "No repository_before implementation to test. This is expected - only repository_after is evaluated."
        }
        metrics = {}
    else:
        # Run actual tests for repository_after
        tests = run_tests("after")
        metrics = run_metrics(repo_path)
    
    return {
        "tests": tests,
        "metrics": metrics
    }


def run_evaluation():
    """Main evaluation function that compares before and after."""
    run_id = str(uuid.uuid4())
    start = datetime.utcnow()
    
    before = evaluate("repository_before")
    after = evaluate("repository_after")
    
    # Determine if evaluation passed
    passed_gate = after["tests"]["passed"]
    
    if passed_gate:
        improvement_summary = "After implementation passed all correctness tests."
    else:
        improvement_summary = "After implementation failed correctness tests."
    
    comparison = {
        "passed_gate": passed_gate,
        "improvement_summary": improvement_summary
    }
    
    end = datetime.utcnow()
    
    return {
        "run_id": run_id,
        "started_at": start.isoformat() + "Z",
        "finished_at": end.isoformat() + "Z",
        "duration_seconds": (end - start).total_seconds(),
        "environment": environment_info(),
        "before": before,
        "after": after,
        "comparison": comparison,
        "success": comparison["passed_gate"],
        "error": None
    }


def main():
    """Main entry point for evaluation."""
    try:
        REPORTS.mkdir(parents=True, exist_ok=True)
        report = run_evaluation()
        path = REPORTS / "latest.json"
        path.write_text(json.dumps(report, indent=2))
        print(f"Report written to {path}")
        print(f"\nEvaluation Result: {'SUCCESS' if report['success'] else 'FAILED'}")
        print(f"Duration: {report['duration_seconds']:.2f} seconds")
        print(f"\nBefore (repository_before):")
        print(f"  Tests Passed: {report['before']['tests']['passed']}")
        print(f"  Return Code: {report['before']['tests']['return_code']}")
        print(f"\nAfter (repository_after):")
        print(f"  Tests Passed: {report['after']['tests']['passed']}")
        print(f"  Return Code: {report['after']['tests']['return_code']}")
        print(f"\nComparison:")
        print(f"  {report['comparison']['improvement_summary']}")
        return 0 if report["success"] else 1
    except Exception as e:
        # Handle unexpected errors
        error_report = {
            "run_id": str(uuid.uuid4()),
            "started_at": datetime.utcnow().isoformat() + "Z",
            "finished_at": datetime.utcnow().isoformat() + "Z",
            "duration_seconds": 0.0,
            "environment": environment_info(),
            "before": None,
            "after": None,
            "comparison": None,
            "success": False,
            "error": str(e)
        }
        REPORTS.mkdir(parents=True, exist_ok=True)
        path = REPORTS / "latest.json"
        path.write_text(json.dumps(error_report, indent=2))
        print(f"Evaluation failed with error: {e}", file=sys.stderr)
        print(f"Error report written to {path}")
        return 1


if __name__ == "__main__":
    sys.exit(main())

