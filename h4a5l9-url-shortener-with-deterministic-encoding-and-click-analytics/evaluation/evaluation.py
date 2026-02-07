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
    """Collect environment information."""
    return {
        "python_version": platform.python_version(),
        "platform": platform.platform()
    }


def run_tests(repo_name):
    """Run pytest on the specified repository."""
    try:
        # Set PYTHONPATH to include the repository
        env = {
            'PYTHONPATH': str(ROOT / repo_name)
        }
        
        proc = subprocess.run(
            [sys.executable, "-m", "pytest", "tests", "-v", "--tb=no", "--no-header", "-q"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=300,
            env={**subprocess.os.environ, **env}
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
            "output": "pytest timeout after 300 seconds"
        }
    except Exception as e:
        return {
            "passed": False,
            "return_code": -1,
            "output": f"Error running tests: {str(e)}"
        }


def run_metrics(repo_path):
    return {}


def evaluate(repo_name):
    """Evaluate a single repository."""
    repo_path = ROOT / repo_name
    tests = run_tests(repo_name)
    metrics = run_metrics(repo_path)
    
    return {
        "tests": tests,
        "metrics": metrics
    }


def run_evaluation():
    """Run full evaluation comparing before and after."""
    run_id = str(uuid.uuid4())
    start = datetime.utcnow()
    
    print("=" * 70)
    print("EVALUATION STARTED")
    print("=" * 70)
    print()
    
    print("Evaluating repository_before...")
    print("-" * 70)
    before = evaluate("repository_before")
    print(f"Before Status: {'PASSED' if before['tests']['passed'] else 'FAILED'}")
    print(f"Before Return Code: {before['tests']['return_code']}")
    print()
    
    print("Evaluating repository_after...")
    print("-" * 70)
    after = evaluate("repository_after")
    print(f"After Status: {'PASSED' if after['tests']['passed'] else 'FAILED'}")
    print(f"After Return Code: {after['tests']['return_code']}")
    print()
    
    # Determine success - only after needs to pass
    passed_gate = after["tests"]["passed"]
    
    if passed_gate:
        improvement_summary = "After implementation passed all correctness checks"
    else:
        improvement_summary = "After implementation failed some tests"
    
    comparison = {
        "passed_gate": passed_gate,
        "improvement_summary": improvement_summary,
        "before_passed": before["tests"]["passed"],
        "after_passed": after["tests"]["passed"]
    }
    
    end = datetime.utcnow()
    
    print("=" * 70)
    print("EVALUATION SUMMARY")
    print("=" * 70)
    print(f"Before: {'PASSED' if before['tests']['passed'] else 'FAILED'}")
    print(f"After: {'PASSED' if after['tests']['passed'] else 'FAILED'}")
    print(f"Overall: {'SUCCESS' if passed_gate else 'FAILURE'}")
    print("=" * 70)
    print()
    
    return {
        "run_id": run_id,
        "started_at": start.isoformat() + "Z",
        "finished_at": end.isoformat() + "Z",
        "duration_seconds": (end - start).total_seconds(),
        "environment": environment_info(),
        "before": before,
        "after": after,
        "comparison": comparison,
        "success": passed_gate,
        "error": None
    }


def main():
    """Main entry point."""
    try:
        REPORTS.mkdir(parents=True, exist_ok=True)
        
        report = run_evaluation()
        
        # Write report
        path = REPORTS / "latest.json"
        path.write_text(json.dumps(report, indent=2))
        
        print(f"Report written to {path}")
        print(f"Success: {report['success']}")
        
        # Always return 0 to avoid collapsing CI
        # The report contains the actual pass/fail status
        return 0
    
    except Exception as e:
        print(f"Evaluation failed with error: {str(e)}")
        
        # Write error report
        REPORTS.mkdir(parents=True, exist_ok=True)
        error_report = {
            "run_id": str(uuid.uuid4()),
            "started_at": datetime.utcnow().isoformat() + "Z",
            "finished_at": datetime.utcnow().isoformat() + "Z",
            "duration_seconds": 0,
            "environment": environment_info(),
            "before": None,
            "after": None,
            "comparison": None,
            "success": False,
            "error": str(e)
        }
        
        path = REPORTS / "latest.json"
        path.write_text(json.dumps(error_report, indent=2))
        
        return 0


if __name__ == "__main__":
    sys.exit(main())
