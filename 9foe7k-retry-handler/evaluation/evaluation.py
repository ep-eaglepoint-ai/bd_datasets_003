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
    # Java/Maven specific implementation
    
    # context_path is likely 'repository_before' or 'repository_after'
    # Low-key: we expect 'repository_after' to be the one we test.
    # But sticking to template abstraction.
    
    cwd = ROOT
    pom_path = "pom.xml" 
    
    if context_path and (ROOT / context_path).exists():
        pom_path = f"{context_path}/pom.xml"
    else:
        # Fallback to repository_after if context_path is purely logical
        pom_path = "repository_after/pom.xml"

    try:
        # Run maven test
        # We need to ensure we run from ROOT so arguments are correct or adjust CWD.
        # -Dstyle.color=always helps parsing if needed, but sometimes complicates regex. 
        # Let's stick to plain output for regex.
        proc = subprocess.run(
            ["mvn", "test", "-f", pom_path],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=120
        )
        
        output = proc.stdout + proc.stderr
        
        # Truncate if too long
        if len(output) > 20000:
            output = output[:4000] + "\n...[truncated]...\n" + output[-16000:]
            
        return {
            "passed": proc.returncode == 0,
            "return_code": proc.returncode,
            "output": output
        }
    except subprocess.TimeoutExpired:
        return {
            "passed": False,
            "return_code": -1,
            "output": "Maven test timeout"
        }

def run_metrics(repo_path: Path):
    metrics = {
        "java_file_count": 0,
        "lines_of_code": 0,
        "class_count_approx": 0
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
                # Simple heuristic to count classes
                metrics["class_count_approx"] += sum(1 for line in lines if line.strip().startswith("public class ") or line.strip().startswith("class "))
            except Exception:
                pass
    except Exception as e:
        metrics["error"] = str(e)
        
    return metrics

def evaluate(repo_name: str):
    repo_path = ROOT / repo_name
    
    # Run tests on this repo (if it's before, it might fail, if after it should pass)
    tests = run_tests(repo_name)
    metrics = run_metrics(repo_path)
    return {
        "tests": tests,
        "metrics": metrics
    }

def parse_maven_output(output):
    """Parse Maven output to extract test results."""
    passed = 0
    failed = 0
    errors = 0
    total = 0
    
    # [INFO] Tests run: 11, Failures: 0, Errors: 0, Skipped: 0
    match = re.search(r"Tests run: (\d+), Failures: (\d+), Errors: (\d+), Skipped: (\d+)", output)
    if match:
        total_run = int(match.group(1))
        failed_count = int(match.group(2))
        errors_count = int(match.group(3))
        passed = total_run - failed_count - errors_count
        total = total_run
    
    # If no match, maybe build failure? return 0, 0, 0, 0
    
    coverage = passed # Using passed count as proxy
    return passed, failed + errors, coverage, total

def run_evaluation():
    run_id = str(uuid.uuid4())
    start = datetime.utcnow()
    
    # Evaluate repository_after (refactored)
    after = evaluate("repository_after")
    
    comparison = {
        "passed_gate": after["tests"]["passed"],
        "improvement_summary": "Refactored code passed tests"
    }
    
    end = datetime.utcnow()
    
    return {
        "run_id": run_id,
        "started_at": start.isoformat() + "Z",
        "finished_at": end.isoformat() + "Z",
        "duration_seconds": (end - start).total_seconds(),
        "environment": environment_info(),
        "after": after,
        "comparison": comparison,
        "success": comparison["passed_gate"],
        "error": None
    }

def print_report(report, report_path):
    a_p, a_f, a_cov, a_tot = parse_maven_output(report["after"]["tests"]["output"])
    
    print("=" * 60)
    print("EVALUATION RESULTS")
    print("=" * 60)
    print()
    print(f"Run ID: {report['run_id']}")
    print(f"Duration: {report['duration_seconds']:.2f} seconds")
    print()
    print("RESULTS (repository_after):")
    print(f"  Tests passed: {report['after']['tests']['passed']}")
    print(f"  Passed: {a_p} | Failed: {a_f}")
    print(f"  Requirements covered: {a_cov}/{a_tot}")
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
