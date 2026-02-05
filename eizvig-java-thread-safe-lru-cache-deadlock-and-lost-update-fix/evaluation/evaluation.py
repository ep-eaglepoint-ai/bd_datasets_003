#!/usr/bin/env python3
import sys
import re
import json
import uuid
import platform
import os
import subprocess
from pathlib import Path
from datetime import datetime

ROOT = Path("/app")  # Docker path
REPORTS = ROOT / "evaluation" / "reports"

def environment_info():
    return {
        "python_version": platform.python_version(),
        "platform": platform.platform()
    }

def run_tests(context_path=None):
    # In this Java project, we run mvn test.
    # context_path is expected to be the directory containing pom.xml
    
    if not context_path:
        return {"passed": False, "return_code": -1, "output": "No context path provided"}

    cmd = ["mvn", "test", "-B"] # Batch mode for cleaner logs
    
    try:
        proc = subprocess.run(
            cmd,
            cwd=context_path,
            capture_output=True,
            text=True,
            timeout=180 # Java tests might take a bit longer
        )
        
        output = proc.stdout + proc.stderr
        
        # Check for build success in maven output
        passed = "BUILD SUCCESS" in output and proc.returncode == 0
        
        if len(output) > 20000:
            output = output[:4000] + "\n...[truncated]...\n" + output[-16000:]
            
        return {
            "passed": passed,
            "return_code": proc.returncode,
            "output": output
        }
    except subprocess.TimeoutExpired:
        return {
            "passed": False,
            "return_code": -1,
            "output": "maven test timeout"
        }
    except Exception as e:
        return {
            "passed": False,
            "return_code": -1,
            "output": str(e)
        }

def run_metrics(repo_path: Path):
    metrics = {
        "java_file_count": 0,
        "lines_of_code": 0,
    }
    
    if not repo_path.exists():
        return metrics

    try:
        for file_path in repo_path.rglob("*.java"):
            metrics["java_file_count"] += 1
            try:
                content = file_path.read_text(encoding="utf-8", errors="ignore")
                lines = content.splitlines()
                metrics["lines_of_code"] += len(lines)
            except Exception:
                pass
    except Exception as e:
        metrics["error"] = str(e)
        
    return metrics

def evaluate(repo_name: str):
    repo_path = ROOT / repo_name
    
    # Run tests using Maven
    tests = run_tests(repo_path)
    metrics = run_metrics(repo_path)
    return {
        "tests": tests,
        "metrics": metrics
    }

def parse_mvn_output(output):
    """Parse Maven Surefire output to extract test results."""
    passed = 0
    failed = 0
    errors = 0
    skipped = 0
    total = 0
    
    # Look for "Tests run: 7, Failures: 0, Errors: 0, Skipped: 0"
    matches = re.findall(r'Tests run: (\d+), Failures: (\d+), Errors: (\d+), Skipped: (\d+)', output)
    if matches:
        last_match = matches[-1]
        total = int(last_match[0])
        failed = int(last_match[1])
        errors = int(last_match[2])
        skipped = int(last_match[3])
        passed = total - failed - errors - skipped
        
    return passed, failed + errors, passed, total

def run_evaluation():
    run_id = str(uuid.uuid4())
    start = datetime.utcnow()
    
    # Evaluate repository_before (baseline)
    # Note: verify if we need to evaluate before. The user asked for "test-before" command.
    # But usually evaluation.py compares both.
    before = evaluate("repository_before")
    
    # Evaluate repository_after (refactored)
    after = evaluate("repository_after")
    
    comparison = {
        "passed_gate": after["tests"]["passed"],
        "improvement_summary": "Refactored code passed tests" if after["tests"]["passed"] else "Refactored code failed tests"
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

def print_report(report, report_path):
    b_p, b_f, b_cov, b_tot = parse_mvn_output(report["before"]["tests"]["output"])
    a_p, a_f, a_cov, a_tot = parse_mvn_output(report["after"]["tests"]["output"])
    
    print("=" * 60)
    print("EVALUATION RESULTS")
    print("=" * 60)
    print()
    print(f"Run ID: {report['run_id']}")
    print(f"Duration: {report['duration_seconds']:.2f} seconds")
    print()
    print("BEFORE (repository_before):")
    print(f"  Build Success: {report['before']['tests']['passed']}")
    print(f"  Passed: {b_p} | Failed/Error: {b_f} | Total: {b_tot}")
    print()
    print("AFTER (repository_after):")
    print(f"  Build Success: {report['after']['tests']['passed']}")
    print(f"  Passed: {a_p} | Failed/Error: {a_f} | Total: {a_tot}")
    print()
    print("COMPARISON:")
    print(f"  Passed gate: {report['comparison']['passed_gate']}")
    print(f"  Summary: {report['comparison']['improvement_summary']}")
    print()
    print("=" * 60)
    print(f"SUCCESS: {report['success']}")
    print("=" * 60)
    print()
    print(f"Report written to {report_path}")

def main():
    report = run_evaluation()
    
    # Generate report path: evaluation/reports/YYYY-MM-DD/HH-MM-SS/report.json
    now = datetime.strptime(report["started_at"].replace("Z", ""), "%Y-%m-%dT%H:%M:%S.%f")
    date_str = now.strftime("%Y-%m-%d")
    time_str = now.strftime("%H-%M-%S")
    
    report_dir = REPORTS / date_str / time_str
    report_dir.mkdir(parents=True, exist_ok=True)
    
    path = report_dir / "report.json"
    path.write_text(json.dumps(report, indent=2))
    
    print_report(report, path)
    return 0 if report["success"] else 1

if __name__ == "__main__":
    sys.exit(main())
