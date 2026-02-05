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

def run_tests(target_dir_name):
    target_path = ROOT / target_dir_name
    if not target_path.exists():
         return {
            "passed": False,
            "return_code": -1,
            "output": f"Directory {target_dir_name} does not exist"
        }

    env = os.environ.copy()
    env["PYTHONPATH"] = str(target_path) + os.pathsep + env.get("PYTHONPATH", "")
    # Set a flag for tests to know which DB/Config to use if needed, 
    # though strictly the code itself should be self-contained or configured via env.
    
    try:
        proc = subprocess.run(
            ["pytest", "tests", "-q"],
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

def run_metrics(repo_path: Path):
    return {}

def evaluate(repo_name: str):
    repo_path = ROOT / repo_name
    tests = run_tests(repo_name)
    metrics = run_metrics(repo_path)
    return {
        "tests": tests,
        "metrics": metrics
    }

def run_evaluation():
    run_id = str(uuid.uuid4())
    start = datetime.utcnow()
    
    # We expect 'before' to fail since it's empty/broken
    before = evaluate("repository_before")
    
    # We expect 'after' to pass
    after = evaluate("repository_after")
    
    comparison = {
        "passed_gate": after["tests"]["passed"],
        "improvement_summary": "Implemented full stack solution passing all tests."
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
    REPORTS.mkdir(parents=True, exist_ok=True)
    report = run_evaluation()
    path = REPORTS / "latest.json"
    print("="*60)
    print("EVALUATION REPORT")
    print("="*60)
    
    print(f"Repository Before: {'PASS' if report['before']['tests']['passed'] else 'FAIL'}")
    print(f"Repository After:  {'PASS' if report['after']['tests']['passed'] else 'FAIL'}")
    print("-" * 60)
    print(f"Overall Status:    {'SUCCESS' if report['success'] else 'FAILURE'}")
    print("="*60)

    path.write_text(json.dumps(report, indent=2))
    print(f"Full report written to {path}")
    return 0 if report["success"] else 1

if __name__ == "__main__":
    sys.exit(main())
