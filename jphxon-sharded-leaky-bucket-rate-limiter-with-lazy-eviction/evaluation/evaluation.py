import os
import json
import subprocess
import time
import uuid
import platform
import shutil
from pathlib import Path
from datetime import datetime
from typing import Dict, Any

ROOT = Path("/app")
REPORTS = ROOT / "evaluation" / "reports"

def environment_info() -> Dict[str, str]:
    return {
        "python_version": platform.python_version(),
        "platform": f"{platform.system()} {platform.release()}",
    }

def run_tests() -> Dict[str, Any]:
    test_result = {
        "passed": False,
        "return_code": 1,
        "output": "",
        "tests_run": 0,
        "failures": 0,
    }
    
    try:
        # Run Go tests
        cmd = ["go", "test", "-v", "./tests/..."]
        result = subprocess.run(
            cmd,
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=120
        )
        
        test_result["return_code"] = result.returncode
        test_result["output"] = result.stdout + result.stderr
        
        # Parse output
        output = test_result["output"]
        if "FAIL" in output:
             test_result["passed"] = False
             test_result["failures"] = output.count("FAIL:") # Approximation
        elif "PASS" in output:
             test_result["passed"] = True
             test_result["failures"] = 0
             
        test_result["tests_run"] = output.count("RUN   Test")
             
    except Exception as e:
        test_result["output"] = str(e)
        
    return test_result

def evaluate() -> Dict[str, Any]:
    return {
        "tests": run_tests(),
    }

def print_report(report: Dict[str, Any], report_path: Path):
    print("=" * 60)
    print("EVALUATION RESULTS")
    print("=" * 60)
    print()
    print(f"Run ID: {report['run_id']}")
    print()
    
    tests = report["after"]["tests"]
    print(f"Tests passed: {tests['passed']}")
    print(f"Tests run:    {tests['tests_run']}")
    print(f"Failures:     {tests['failures']}")
    if not tests['passed']:
         print("DEBUG OUTPUT:")
         print(tests.get('output'))
    print()
    print("=" * 60)
    print(f"SUCCESS: {report['success']}")
    print("=" * 60)
    print(f"Report written to {report_path}")

def main():
    run_id = str(uuid.uuid4())
    start_time = time.time()
    
    print("Starting evaluation...")
    
    # Evaluate
    after = evaluate()
    
    passed_gate = after["tests"]["passed"]
    
    duration = time.time() - start_time
    
    report = {
        "run_id": run_id,
        "timestamp": datetime.now().isoformat(),
        "duration_seconds": duration,
        "environment": environment_info(),
        "after": after,
        "success": passed_gate
    }
    
    date_str = datetime.now().strftime("%Y-%m-%d")
    time_str = datetime.now().strftime("%H-%M-%S")
    report_dir = REPORTS / date_str / time_str
    report_dir.mkdir(parents=True, exist_ok=True)
    
    report_path = report_dir / "report.json"
    with open(report_path, 'w') as f:
        json.dump(report, f, indent=2)
        
    print_report(report, report_path)
    exit(0 if report["success"] else 1)

if __name__ == "__main__":
    main()
