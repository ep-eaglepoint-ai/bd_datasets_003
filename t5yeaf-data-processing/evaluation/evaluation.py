#!/usr/bin/env python3
import sys
import re
import json
import uuid
import platform
import subprocess
from pathlib import Path
from datetime import datetime

ROOT = Path("/app") 
REPORTS = ROOT / "evaluation" / "reports"

def environment_info():
    return {
        "python_version": platform.python_version(),
        "platform": platform.platform()
    }

def run_tests(profile):
    """Run maven tests with specific profile"""
    cmd = ["mvn", "test", "-B", f"-P{profile}"]
    print(f"Running tests with profile: {profile}...")
    
    try:
        proc = subprocess.run(
            cmd,
            cwd=ROOT,  # Run from root where pom.xml is
            capture_output=True,
            text=True,
            timeout=300
        )
        
        output = proc.stdout + proc.stderr
        passed = "BUILD SUCCESS" in output and proc.returncode == 0
        
        return {
            "passed": passed,
            "return_code": proc.returncode,
            "output": output
        }
    except Exception as e:
        return {
            "passed": False,
            "return_code": -1,
            "output": str(e)
        }

def evaluate(profile: str):
    # Run tests using Maven with profile
    tests = run_tests(profile)
    return {
        "tests": tests
    }

def parse_mvn_output(output):
    """Parse Maven Surefire output to extract test results."""
    passed = 0
    failed = 0
    errors = 0
    skipped = 0
    total = 0
    
    # Example: Tests run: 7, Failures: 0, Errors: 0, Skipped: 0
    matches = re.findall(r'Tests run: (\d+), Failures: (\d+), Errors: (\d+), Skipped: (\d+)', output)
    if matches:
        # Sum up all modules if multiple (here only one)
        for m in matches:
            total += int(m[0])
            failed += int(m[1])
            errors += int(m[2])
            skipped += int(m[3])
    
    passed = total - failed - errors - skipped    
    return passed, failed + errors, passed, total

def run_evaluation():
    run_id = str(uuid.uuid4())
    start = datetime.utcnow()
    
    # 1. Evaluate 'before' (optional, but good for baseline)
    print("Evaluating BEFORE implementation...")
    before = evaluate("before")
    
    # 2. Evaluate 'after'
    print("Evaluating AFTER implementation...")
    after = evaluate("after")
    
    comparison = {
        "passed_gate": after["tests"]["passed"],
        "improvement_summary": "Optimized code passed all tests" if after["tests"]["passed"] else "Tests failed"
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
    
    # Save report
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