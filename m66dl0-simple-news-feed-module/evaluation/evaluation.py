"""
Evaluation script for Simple News Feed Module Test Suite.

Runs tests against repository_before and repository_after,
then generates a comparison report.
"""

import subprocess
import json
import os
import uuid
import platform
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPORTS_DIR = os.path.join(ROOT, "evaluation", "reports")

os.makedirs(REPORTS_DIR, exist_ok=True)


def get_environment_info():
    """Get environment information."""
    return {
        "python_version": platform.python_version(),
        "platform": platform.system(),
        "arch": platform.machine(),
        "cpus": os.cpu_count()
    }


def run_tests(repo_path: str) -> dict:
    """
    Run pytest against a specific repository path.
    
    Returns dict with passed, return_code, output.
    """
    if repo_path == "repository_before":
        # No implementation in repository_before
        return {
            "passed": False,
            "return_code": 1,
            "output": "No implementation in repository_before"
        }
    else:
        # Run tests against repository_after
        cmd = ["python", "-m", "pytest", "tests/test_news_feed.py", "-v"]
    
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=120,
            cwd=ROOT
        )
        
        passed = result.returncode == 0
        output = result.stdout + result.stderr
        
        return {
            "passed": passed,
            "return_code": result.returncode,
            "output": output[:500] if len(output) > 500 else output
        }
    except subprocess.TimeoutExpired:
        return {
            "passed": False,
            "return_code": -1,
            "output": "Test execution timed out"
        }
    except Exception as e:
        return {
            "passed": False,
            "return_code": -1,
            "output": str(e)
        }


def run_evaluation():
    """Run complete evaluation and generate report."""
    run_id = str(uuid.uuid4())
    start_time = datetime.now()
    start_time_iso = start_time.isoformat()
    
    print(f"Starting evaluation (Run ID: {run_id})...")
    
    print("Running baseline tests (before)...")
    before_result = run_tests("repository_before")
    
    print("Running tests (after)...")
    after_result = run_tests("repository_after")
    
    end_time = datetime.now()
    end_time_iso = end_time.isoformat()
    duration_seconds = (end_time - start_time).total_seconds()
    
    if not before_result["passed"] and after_result["passed"]:
        improvement_summary = "Tests pass after implementation - requirements met."
    elif before_result["passed"] and after_result["passed"]:
        improvement_summary = "Tests passed in both states."
    elif not after_result["passed"]:
        improvement_summary = "Implementation failed to pass requirements."
    else:
        improvement_summary = "No tests in repository_before."
    
    report = {
        "run_id": run_id,
        "started_at": start_time_iso,
        "finished_at": end_time_iso,
        "duration_seconds": duration_seconds,
        "environment": get_environment_info(),
        "before": {
            "tests": before_result,
            "metrics": {}
        },
        "after": {
            "tests": after_result,
            "metrics": {}
        },
        "comparison": {
            "passed_gate": after_result["passed"],
            "improvement_summary": improvement_summary
        },
        "success": after_result["passed"],
        "error": None
    }
    
    report_path = os.path.join(REPORTS_DIR, "report.json")
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)
    
    print(f"Evaluation complete. Success: {report['success']}")
    print(f"Report written to: {report_path}")
    print(json.dumps(report, indent=2))
    
    exit(0 if report["success"] else 1)


if __name__ == "__main__":
    run_evaluation()
