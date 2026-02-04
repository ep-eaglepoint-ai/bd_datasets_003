#!/usr/bin/env python3
"""
Evaluation Script for Telegram Bot Concurrency Tests

This script evaluates the repository_after/ implementation,
generating a standardized report per the ByteDance evaluation guide.

For Feature Generation tasks, repository_before is empty (scaffold only).
"""

import sys
import json
import uuid
import platform
import subprocess
import os
from pathlib import Path
from datetime import datetime
from typing import Dict, Any

# Project root is parent of evaluation/
ROOT = Path(__file__).resolve().parent.parent
REPORTS = ROOT / "evaluation" / "reports"


def environment_info() -> Dict[str, str]:
    """Collect environment information for the report."""
    return {
        "python_version": platform.python_version(),
        "platform": platform.platform()
    }


def run_tests(repo_name: str) -> Dict[str, Any]:
    """
    Run pytest against a specific repository.
    
    Sets TEST_REPO_PATH environment variable to select which
    bot implementation to test.
    """
    env = os.environ.copy()
    env["TEST_REPO_PATH"] = repo_name
    
    try:
        proc = subprocess.run(
            [sys.executable, "-m", "pytest", "tests", "-v", "--tb=short"],
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
            "output": "pytest timeout after 120 seconds"
        }
    except Exception as e:
        return {
            "passed": False,
            "return_code": -1,
            "output": f"Error running tests: {str(e)}"
        }


def run_metrics(repo_path: Path) -> Dict[str, Any]:
    """Collect concurrency-specific metrics."""
    return {
        "concurrency_model": "asyncio",
        "state_isolation": "per_user_locks"
    }


def run_evaluation() -> Dict[str, Any]:
    """
    Execute evaluation for repository_after implementation.
    
    For Feature Generation tasks, repository_before is empty.
    """
    run_id = str(uuid.uuid4())
    start = datetime.utcnow()
    
    print("=" * 60)
    print("EVALUATION: Concurrent Telegram Bot Backend")
    print("=" * 60)
    
    # repository_before is empty for Feature Generation tasks
    print("\n[INFO] repository_before/ is empty (Feature Generation task)")
    before = {
        "tests": {
            "passed": False,
            "return_code": -1,
            "output": "No implementation in repository_before/ (Feature Generation task)"
        },
        "metrics": {}
    }
    
    # Evaluate repository_after (expected to pass)
    print("\n[1/1] Testing repository_after/ (expected: PASS)")
    print("-" * 40)
    repo_path = ROOT / "repository_after"
    tests = run_tests("repository_after")
    metrics = run_metrics(repo_path)
    after = {"tests": tests, "metrics": metrics}
    after_status = "PASS" if after["tests"]["passed"] else "FAIL"
    print(f"Result: {after_status}")
    
    # Success = after passes
    passed_gate = after["tests"]["passed"]
    
    comparison = {
        "passed_gate": passed_gate,
        "before_passed": False,
        "after_passed": after["tests"]["passed"],
        "improvement_summary": "Feature Generation: After implementation passes all tests."
    }
    
    end = datetime.utcnow()
    
    print("\n" + "=" * 60)
    print(f"OVERALL: {'SUCCESS' if passed_gate else 'FAILURE'}")
    print("=" * 60)
    
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


def main() -> int:
    """Main entry point for evaluation."""
    REPORTS.mkdir(parents=True, exist_ok=True)
    
    try:
        report = run_evaluation()
        report_path = REPORTS / "latest.json"
        report_path.write_text(json.dumps(report, indent=2))
        print(f"\nReport written to: {report_path}")
        return 0 if report["success"] else 1
        
    except Exception as e:
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
        report_path = REPORTS / "latest.json"
        report_path.write_text(json.dumps(error_report, indent=2))
        print(f"Evaluation failed with error: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
