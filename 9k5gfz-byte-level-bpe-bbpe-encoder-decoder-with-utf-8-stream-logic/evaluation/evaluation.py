#!/usr/bin/env python3
import sys
import json
import uuid
import platform
import subprocess
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent.parent
REPORTS = ROOT / "evaluation" / "reports"


def environment_info():
    return {
        "python_version": platform.python_version(),
        "platform": platform.platform()
    }


def run_tests():
    try:
        proc = subprocess.run(
            ["python", "-m", "pytest", "tests", "-v", "--tb=short"],
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


def run_metrics(repo_path: Path):
    return {}


def evaluate(repo_name: str):
    repo_path = ROOT / repo_name
    tests = run_tests()
    metrics = run_metrics(repo_path)
    return {
        "tests": tests,
        "metrics": metrics
    }


def run_evaluation():
    run_id = str(uuid.uuid4())
    start = datetime.now(timezone.utc)
    
    before = {
        "tests": {
            "passed": False,
            "return_code": -1,
            "output": "repository_before is empty (0-1 generation task)"
        },
        "metrics": {}
    }
    
    after = evaluate("repository_after")
    
    comparison = {
        "passed_gate": after["tests"]["passed"],
        "improvement_summary": "After implementation passed correctness checks" if after["tests"]["passed"] else "After implementation failed tests"
    }
    
    end = datetime.now(timezone.utc)
    
    return {
        "run_id": run_id,
        "started_at": start.isoformat().replace('+00:00', 'Z'),
        "finished_at": end.isoformat().replace('+00:00', 'Z'),
        "duration_seconds": (end - start).total_seconds(),
        "environment": environment_info(),
        "before": before,
        "after": after,
        "comparison": comparison,
        "success": comparison["passed_gate"],
        "error": None
    }


def main():
    try:
        print("=" * 60)
        print("EVALUATION STARTED")
        print("=" * 60)
        
        REPORTS.mkdir(parents=True, exist_ok=True)
        report = run_evaluation()
        
        print("\n" + "=" * 60)
        print("EVALUATION RESULTS")
        print("=" * 60)
        
        print("\n[BEFORE] repository_before/")
        print(f"  Status: {'PASS' if report['before']['tests']['passed'] else 'FAIL'}")
        print(f"  Return Code: {report['before']['tests']['return_code']}")
        
        print("\n[AFTER] repository_after/")
        print(f"  Status: {'PASS' if report['after']['tests']['passed'] else 'FAIL'}")
        print(f"  Return Code: {report['after']['tests']['return_code']}")
        
        print("\n" + "=" * 60)
        print(f"OVERALL STATUS: {'SUCCESS' if report['success'] else 'FAILED'}")
        print("=" * 60)
        print(f"Duration: {report['duration_seconds']:.2f}s")
        
        path = REPORTS / "latest.json"
        path.write_text(json.dumps(report, indent=2))
        print(f"\nReport written to {path}")
        
        return 0 if report["success"] else 1
    except Exception as e:
        print("\n" + "=" * 60)
        print("EVALUATION CRASHED")
        print("=" * 60)
        print(f"Error: {e}")
        
        error_report = {
            "run_id": str(uuid.uuid4()),
            "started_at": datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
            "finished_at": datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
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
        return 1


if __name__ == "__main__":
    sys.exit(main())
