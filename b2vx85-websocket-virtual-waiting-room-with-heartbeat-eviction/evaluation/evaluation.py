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
        "platform": platform.platform(),
        "node_version": get_node_version()
    }

def get_node_version():
    try:
        result = subprocess.run(
            ["node", "--version"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            return result.stdout.strip() or "unknown"
        error_output = (result.stderr or result.stdout or "").strip()
        if error_output:
            return f"unknown (node exited with {result.returncode}: {error_output})"
        return f"unknown (node exited with {result.returncode})"
    except Exception as e:
        return f"unknown (error: {e})"

def run_tests(repo_path: Path):
    """Run tests for a specific repository"""
    try:
        # Install dependencies first
        install_proc = subprocess.run(
            ["npm", "install"],
            cwd=repo_path,
            capture_output=True,
            text=True,
            timeout=120
        )
        
        if install_proc.returncode != 0:
            return {
                "passed": False,
                "return_code": install_proc.returncode,
                "output": f"npm install failed:\n{install_proc.stdout}\n{install_proc.stderr}"[:8000]
            }

        # Run tests
        test_proc = subprocess.run(
            ["npm", "test"],
            cwd=repo_path,
            capture_output=True,
            text=True,
            timeout=180
        )
        
        return {
            "passed": test_proc.returncode == 0,
            "return_code": test_proc.returncode,
            "output": (test_proc.stdout + test_proc.stderr)[:8000]
        }
    except subprocess.TimeoutExpired:
        return {
            "passed": False,
            "return_code": -1,
            "output": "Test execution timeout"
        }
    except Exception as e:
        return {
            "passed": False,
            "return_code": -1,
            "output": f"Test execution error: {str(e)}"
        }

def run_metrics(repo_path: Path):
    return {}

def evaluate(repo_name: str):
    """Evaluate a single repository"""
    repo_path = ROOT / repo_name
    
    if not repo_path.exists():
        return {
            "tests": {
                "passed": False,
                "return_code": -1,
                "output": f"Repository path does not exist: {repo_path}"
            },
            "metrics": {}
        }
    
    tests = run_tests(repo_path)
    metrics = run_metrics(repo_path)
    
    return {
        "tests": tests,
        "metrics": metrics
    }

def run_evaluation():
    """Main evaluation function"""
    run_id = str(uuid.uuid4())
    start = datetime.now(timezone.utc)
    
    print("Starting evaluation...")
    print(f"Run ID: {run_id}")
    
    # Evaluate before state
    print("\nEvaluating repository_before...")
    before = evaluate("repository_before")
    print(f"Before tests: {'PASSED' if before['tests']['passed'] else 'FAILED'}")
    
    # Evaluate after state
    print("\nEvaluating repository_after...")
    after = evaluate("repository_after")
    print(f"After tests: {'PASSED' if after['tests']['passed'] else 'FAILED'}")
    
    # Determine success
    passed_gate = after["tests"]["passed"]
    
    if passed_gate:
        improvement_summary = "Implementation passed all correctness tests"
    else:
        improvement_summary = "Implementation failed correctness tests"
    
    comparison = {
        "passed_gate": passed_gate,
        "improvement_summary": improvement_summary
    }
    
    end = datetime.now(timezone.utc)
    
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
    """Main entry point"""
    try:
        REPORTS.mkdir(parents=True, exist_ok=True)
        
        report = run_evaluation()
        
        # Write report
        report_path = REPORTS / "latest.json"
        report_path.write_text(json.dumps(report, indent=2))
        
        print(f"\n{'='*60}")
        print(f"Evaluation Report")
        print(f"{'='*60}")
        print(f"Run ID: {report['run_id']}")
        print(f"Duration: {report['duration_seconds']:.2f} seconds")
        print(f"\nBefore State:")
        print(f"  Tests: {'PASSED' if report['before']['tests']['passed'] else 'FAILED'}")
        print(f"\nAfter State:")
        print(f"  Tests: {'PASSED' if report['after']['tests']['passed'] else 'FAILED'}")
        print(f"\nOverall Success: {'YES' if report['success'] else 'NO'}")
        print(f"{'='*60}")
        print(f"\nReport written to {report_path}")
        
        return 0 if report["success"] else 1
        
    except Exception as e:
        print(f"Evaluation failed with error: {str(e)}", file=sys.stderr)
        
        # Write error report
        error_report = {
            "run_id": str(uuid.uuid4()),
            "started_at": datetime.now(timezone.utc).isoformat() + "Z",
            "finished_at": datetime.now(timezone.utc).isoformat() + "Z",
            "duration_seconds": 0.0,
            "environment": environment_info(),
            "before": None,
            "after": None,
            "comparison": None,
            "success": False,
            "error": str(e)
        }
        
        try:
            REPORTS.mkdir(parents=True, exist_ok=True)
            report_path = REPORTS / "latest.json"
            report_path.write_text(json.dumps(error_report, indent=2))
        except Exception as write_error:
            print(
                f"Failed to write error report to {REPORTS / 'latest.json'}: {write_error}",
                file=sys.stderr,
            )
        
        return 1

if __name__ == "__main__":
    sys.exit(main())
