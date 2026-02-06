#!/usr/bin/env python3
"""
Evaluation script for the Password Generator refactoring task.

This script runs tests on both repository_before and repository_after,
compares the results, and produces a machine-readable report.
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
    """Collect environment information."""
    return {
        "python_version": platform.python_version(),
        "platform": platform.platform()
    }


def run_tests(repo_name: str, extra_args: list = None):
    """
    Run tests for a specific repository.
    
    Args:
        repo_name: Name of the repository (before or after)
        extra_args: Additional pytest arguments
        
    Returns:
        dict with test results
    """
    # Map repository name to pytest repo option
    repo_map = {
        "repository_before": "before",
        "repository_after": "after"
    }
    repo_option = repo_map.get(repo_name, repo_name)
    
    cmd = ["pytest", "tests", "-q", "--repo", repo_option]
    if extra_args:
        cmd.extend(extra_args)
    
    try:
        proc = subprocess.run(
            cmd,
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
            "return_code": -2,
            "output": f"Error running tests: {str(e)}"
        }


def run_metrics(repo_name: str):
    """
    Run metrics collection for a specific repository.
    
    This implementation collects performance metrics for password generation.
    
    Args:
        repo_name: Name of the repository
        
    Returns:
        dict with performance metrics
    """
    metrics = {}
    
    try:
        # Import the core module for performance testing
        sys.path.insert(0, str(ROOT / repo_name))
        
        if repo_name == "repository_after":
            from password_generator_core import PasswordGeneratorCore
            core = PasswordGeneratorCore()
        else:
            # For before version, use the wrapper
            sys.path.insert(0, str(ROOT / "tests"))
            from test_password_generator import _BeforeCoreWrapper
            core = _BeforeCoreWrapper()
        
        # Measure password generation time
        iterations = 100
        start = time.perf_counter()
        
        for _ in range(iterations):
            core.generate_password(
                length=12,
                use_letters=True,
                use_digits=True,
                use_symbols=True
            )
        
        end = time.perf_counter()
        avg_time_ms = ((end - start) / iterations) * 1000
        
        metrics = {
            "avg_time_ms": round(avg_time_ms, 2),
            "ops_per_second": round(iterations / (end - start), 2),
            "test_iterations": iterations
        }
        
    except Exception as e:
        metrics = {
            "error": str(e)
        }
    
    return metrics


def evaluate_repo(repo_name: str):
    """
    Evaluate a single repository.
    
    Args:
        repo_name: Name of the repository
        
    Returns:
        dict with test results and metrics
    """
    repo_path = ROOT / repo_name
    tests = run_tests(repo_name)
    metrics = run_metrics(repo_name)
    
    return {
        "tests": tests,
        "metrics": metrics
    }


def run_evaluation():
    """
    Run the full evaluation on both repositories.
    
    Returns:
        dict with complete evaluation report
    """
    run_id = str(uuid.uuid4())
    start = datetime.utcnow()
    
    # Evaluate both repositories
    before = evaluate_repo("repository_before")
    after = evaluate_repo("repository_after")
    
    # Determine improvement summary
    if after["tests"]["passed"]:
        if not before["tests"]["passed"]:
            improvement_summary = "After implementation passed correctness tests. Before version failed due to missing class-based API and thread-safety features."
        else:
            improvement_summary = "Both versions passed tests. After version provides improved thread-safety and cleaner API."
    else:
        improvement_summary = "After implementation did not pass correctness tests."
    
    end = datetime.utcnow()
    
    return {
        "run_id": run_id,
        "started_at": start.isoformat() + "Z",
        "finished_at": end.isoformat() + "Z",
        "duration_seconds": round((end - start).total_seconds(), 2),
        "environment": environment_info(),
        "before": before,
        "after": after,
        "comparison": {
            "passed_gate": after["tests"]["passed"],
            "improvement_summary": improvement_summary
        },
        "success": after["tests"]["passed"],
        "error": None
    }


def main():
    """
    Main entry point for the evaluation script.
    
    Returns:
        int: Exit code (0 for success, 1 for failure)
    """
    # Create reports directory if it doesn't exist
    REPORTS.mkdir(parents=True, exist_ok=True)
    
    # Run evaluation
    report = run_evaluation()
    
    # Write latest report
    path = REPORTS / "latest.json"
    path.write_text(json.dumps(report, indent=2))
    print(f"Report written to {path}")
    
    # Print summary
    print(f"\nEvaluation Complete:")
    print(f"  Run ID: {report['run_id']}")
    print(f"  Duration: {report['duration_seconds']}s")
    print(f"  Before: {'PASSED' if report['before']['tests']['passed'] else 'FAILED'}")
    print(f"  After: {'PASSED' if report['after']['tests']['passed'] else 'FAILED'}")
    print(f"  Success: {report['success']}")
    
    return 0 if report["success"] else 1


if __name__ == "__main__":
    sys.exit(main())
