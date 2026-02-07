#!/usr/bin/env python3
import sys
import json
import time
import uuid
import platform
import subprocess
import os
import re
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent.parent
EVALUATION_DIR = ROOT / "evaluation"

def environment_info():
    return {
        "python_version": platform.python_version(),
        "platform": platform.platform()
    }

def normalize_test_name(line):
    # Extract test name from pytest output
    # Example: tests/test_functional.py::test_ingest_load_data PASSED
    match = re.search(r'::(\w+)', line)
    if match:
        return match.group(1)
    return "unknown_test"

def parse_pytest_output(output):
    results = {}
    lines = output.splitlines()
    for line in lines:
        if "::" in line and ("PASSED" in line or "FAILED" in line or "SKIPPED" in line or "ERROR" in line):
            test_name = normalize_test_name(line)
            if "PASSED" in line:
                results[test_name] = "PASSED"
            elif "FAILED" in line or "ERROR" in line:
                results[test_name] = "FAILED"
            elif "SKIPPED" in line:
                results[test_name] = "SKIPPED"
    return results

def run_tests(repo_name):
    """
    Run pytest with TARGET_REPO set to repo_name.
    """
    env = os.environ.copy()
    env['TARGET_REPO'] = repo_name
    env['PYTHONPATH'] = str(ROOT)

    try:
        # Use -v to get verbose output for parsing
        proc = subprocess.run(
            ["pytest", "tests", "-v"],
            cwd=str(ROOT),
            capture_output=True,
            text=True,
            timeout=180, # Increased timeout for safety
            env=env
        )
        
        parsed_results = parse_pytest_output(proc.stdout)
        
        return {
            "passed": proc.returncode == 0,
            "return_code": proc.returncode,
            "output": (proc.stdout + proc.stderr)[:15000],
            "parsed_results": parsed_results
        }
    except subprocess.TimeoutExpired:
        return {
            "passed": False,
            "return_code": -1,
            "output": "pytest timeout",
            "parsed_results": {}
        }

def run_metrics(repo_name):
    return {}

def evaluate(repo_name: str):
    tests = run_tests(repo_name)
    metrics = run_metrics(repo_name)
    return {
        "tests": tests,
        "metrics": metrics
    }

def print_section_header(title):
    print("=" * 60)
    print(title)
    print("=" * 60)

def print_test_results(results):
    for test_name, status in results.items():
        if status == "PASSED":
            print(f"✅ {test_name}")
        elif status == "FAILED":
            print(f"❌ {test_name}")
        # We can choose to hide skipped or print them with a different icon
        # User prompt only showed check/cross. Let's ignore skipped or use check-ish?
        # User didn't specify behavior for skipped. Let's skip printing skipped or print as check?
        # Standard: skip is usually ignored in such summaries or printed as '?'.
        # Let's print fail for failed, success for passed.
    print()

def main():
    # Generate Run ID and timestamps
    run_id = str(uuid.uuid4())
    start_dt = datetime.now(timezone.utc)
    
    # 1. Run Before
    print_section_header("RUNNING TESTS: BEFORE (repository_before)")
    before = evaluate("repository_before")
    print_test_results(before["tests"].get("parsed_results", {}))
    
    # 2. Run After
    print_section_header("RUNNING TESTS: AFTER (repository_after)")
    after = evaluate("repository_after")
    print_test_results(after["tests"].get("parsed_results", {}))
    
    # Success Logic
    passed_gate = after["tests"]["passed"]
    failed_before = not before["tests"]["passed"] # not strictly required but informative
    
    comparison = {
        "passed_gate": passed_gate,
        "improvement_summary": "After implementation passed tests." if passed_gate else "After implementation failed tests."
    }
    
    end_dt = datetime.now(timezone.utc)
    
    report = {
        "run_id": run_id,
        "started_at": start_dt.isoformat().replace("+00:00", "Z"),
        "finished_at": end_dt.isoformat().replace("+00:00", "Z"),
        "duration_seconds": (end_dt - start_dt).total_seconds(),
        "environment": environment_info(),
        "before": before,
        "after": after,
        "comparison": comparison,
        "success": passed_gate,
        "error": None
    }

    # Save Report
    # Path: evaluation/YYYY-MM-DD/HH-MM-SS/report.json
    # We use local time for the directory structure as requested? 
    # The user example: evaluation/2026-02-05/18-41-12/report.json
    # The ephemeral output says current time is 2026-02-05T16:... 
    # I should use the current time for the path.
    
    now = datetime.now()
    date_str = now.strftime("%Y-%m-%d")
    time_str = now.strftime("%H-%M-%S")
    
    report_dir = EVALUATION_DIR / date_str / time_str
    report_dir.mkdir(parents=True, exist_ok=True)
    report_path = report_dir / "report.json"
    
    report_path.write_text(json.dumps(report, indent=2))
    
    # Summary Output
    print_section_header("EVALUATION SUMMARY")
    
    # Count passed/total
    def get_stats(data):
        results = data["tests"].get("parsed_results", {})
        total = len(results)
        passed = sum(1 for s in results.values() if s == "PASSED")
        status = "PASSED" if data["tests"]["passed"] else "FAILED"
        return status, passed, total

    b_status, b_pass, b_total = get_stats(before)
    a_status, a_pass, a_total = get_stats(after)
    
    print(f"Before: {b_status} ({b_pass}/{b_total} passed)")
    print(f"After: {a_status} ({a_pass}/{a_total} passed)")
    print()
    print(f"Report saved to: evaluation/{date_str}/{time_str}/report.json")
    print(f"Success: {'YES' if passed_gate else 'NO'}")
    
    return 0 if passed_gate else 1

if __name__ == "__main__":
    sys.exit(main())
