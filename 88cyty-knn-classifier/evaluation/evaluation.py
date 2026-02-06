#!/usr/bin/env python3
"""
Evaluation script for KNN Classifier implementation.

Compares repository_before/ and repository_after/ test results.
Since repository_before/ doesn't exist, it's marked as failed statically.
"""

import sys
import json
import uuid
import platform
import subprocess
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


def run_tests(repo_name: str):
    """
    Run pytest tests for a given repository.
    
    Args:
        repo_name: Name of the repository to test ("repository_before" or "repository_after")
    
    Returns:
        dict with test results: passed, return_code, output
    """
    # Check if repository exists
    repo_path = ROOT / repo_name
    if not repo_path.exists():
        return {
            "passed": False,
            "return_code": 1,
            "output": f"no {repo_name} to be tested"
        }
    
    try:
        # Extract repo identifier for --repo flag (e.g., "repository_after" -> "after")
        repo_flag = repo_name.replace("repository_", "") if repo_name.startswith("repository_") else repo_name
        
        # Run pytest with --repo flag to specify which repository to test
        proc = subprocess.run(
            ["pytest", "tests", "--repo", repo_flag, "-q"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=120
        )
        
        # Combine stdout and stderr, truncate to 8000 chars
        output = (proc.stdout + proc.stderr)[:8000]
        
        return {
            "passed": proc.returncode == 0,
            "return_code": proc.returncode,
            "output": output
        }
    except subprocess.TimeoutExpired:
        return {
            "passed": False,
            "return_code": -1,
            "output": "pytest timeout after 120 seconds"
        }
    except Exception as e:
        return {
            "passed": False,
            "return_code": -1,
            "output": f"Error running tests: {str(e)}"
        }


def run_metrics(repo_path: Path):
    """
    Collect optional metrics for a repository.
    
    Args:
        repo_path: Path to the repository
    
    Returns:
        dict with metrics (empty for this task)
    """
    # No metrics required for this task
    return {}


def evaluate(repo_name: str):
    """
    Evaluate a repository by running tests and collecting metrics.
    
    Args:
        repo_name: Name of the repository to evaluate
    
    Returns:
        dict with tests and metrics results
    """
    repo_path = ROOT / repo_name
    
    # Run tests
    tests = run_tests(repo_name)
    
    # Collect metrics (optional, empty for this task)
    metrics = run_metrics(repo_path)
    
    return {
        "tests": tests,
        "metrics": metrics
    }


def run_evaluation():
    """
    Run the complete evaluation comparing before and after repositories.
    
    Returns:
        dict with complete evaluation report
    """
    run_id = str(uuid.uuid4())
    start = datetime.utcnow()
    
    # Evaluate repository_before (statically set to failed since it doesn't exist)
    before = {
        "tests": {
            "passed": False,
            "return_code": 1,
            "output": "no repository_before to be tested"
        },
        "metrics": {}
    }
    
    # Evaluate repository_after (run actual tests)
    after = evaluate("repository_after")
    
    # Compare results
    comparison = {
        "passed_gate": after["tests"]["passed"],
        "improvement_summary": (
            "After implementation passed correctness tests"
            if after["tests"]["passed"]
            else "After implementation failed correctness tests"
        )
    }
    
    end = datetime.utcnow()
    duration = (end - start).total_seconds()
    
    return {
        "run_id": run_id,
        "started_at": start.isoformat() + "Z",
        "finished_at": end.isoformat() + "Z",
        "duration_seconds": duration,
        "environment": environment_info(),
        "before": before,
        "after": after,
        "comparison": comparison,
        "success": comparison["passed_gate"],
        "error": None
    }


def main():
    """
    Main entry point for the evaluation script.
    
    Returns:
        int: Exit code (0 for success, 1 for failure)
    """
    try:
        # Create reports directory if it doesn't exist
        REPORTS.mkdir(parents=True, exist_ok=True)
        
        # Run evaluation
        report = run_evaluation()
        
        # Write report to latest.json
        report_path = REPORTS / "latest.json"
        report_path.write_text(json.dumps(report, indent=2))
        
        print(f"Report written to {report_path}")
        
        # Return exit code based on success
        return 0 if report["success"] else 1
        
    except Exception as e:
        # Handle evaluation errors
        error_report = {
            "run_id": str(uuid.uuid4()),
            "started_at": datetime.utcnow().isoformat() + "Z",
            "finished_at": datetime.utcnow().isoformat() + "Z",
            "duration_seconds": 0.0,
            "environment": environment_info(),
            "before": {
                "tests": {"passed": False, "return_code": -1, "output": ""},
                "metrics": {}
            },
            "after": {
                "tests": {"passed": False, "return_code": -1, "output": ""},
                "metrics": {}
            },
            "comparison": {
                "passed_gate": False,
                "improvement_summary": "Evaluation failed due to error"
            },
            "success": False,
            "error": str(e)
        }
        
        REPORTS.mkdir(parents=True, exist_ok=True)
        report_path = REPORTS / "latest.json"
        report_path.write_text(json.dumps(error_report, indent=2))
        
        print(f"Evaluation error: {e}", file=sys.stderr)
        print(f"Error report written to {report_path}", file=sys.stderr)
        
        return 1


if __name__ == "__main__":
    sys.exit(main())

