import os
import sys
import json
import uuid
import platform
import subprocess
import re
from datetime import datetime

# Configuration
ROOT_DIR = os.path.dirname(os.path.abspath(__file__)) # Assuming evaluation.py is in the root or close to it
if os.path.basename(ROOT_DIR) == "evaluation":
    ROOT_DIR = os.path.dirname(ROOT_DIR)

REPORTS_DIR = os.path.join(ROOT_DIR, "evaluation", "reports")

def get_environment_info():
    return {
        "python_version": platform.python_version(),
        "platform": f"{platform.system()}-{platform.machine()}"
    }

def strip_ansi(text):
    ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
    return ansi_escape.sub('', text)

def parse_pytest_output(output):
    clean_output = strip_ansi(output)
    
    # Example pytest output: "15 passed in 0.05s"
    # or "1 failed, 14 passed in 0.10s"
    
    tests_passed = 0
    tests_failed = 0
    tests_skipped = 0
    
    # Search for the summary line at the end
    summary_match = re.search(r'==+ (.*?) ==+', clean_output.splitlines()[-1])
    if summary_match:
        summary_text = summary_match.group(1)
        
        passed_match = re.search(r'(\d+) passed', summary_text)
        if passed_match:
            tests_passed = int(passed_match.group(1))
            
        failed_match = re.search(r'(\d+) failed', summary_text)
        if failed_match:
            tests_failed = int(failed_match.group(1))
            
        skipped_match = re.search(r'(\d+) skipped', summary_text)
        if skipped_match:
            tests_skipped = int(skipped_match.group(1))

    # Fallback if specific summary line isn't found perfectly (e.g. error before summary)
    if tests_passed == 0 and tests_failed == 0 and "collected" in clean_output:
        # Try to parse from "collected X items"
        collected_match = re.search(r'collected (\d+) items', clean_output)
        if collected_match:
            total = int(collected_match.group(1))
            if "FAILURES" in clean_output or "ERRORS" in clean_output:
                # Naive fallback: if we can't parse exactly, assume all failed if it didn't complete
                pass 
                
    return {
        "tests_passed": tests_passed,
        "tests_failed": tests_failed,
        "tests_skipped": tests_skipped
    }

def run_tests(repo_type):
    if repo_type == "before":
        # Simulate failure for "before" as per instruction context (implied empty/broken)
        return {
            "passed": False,
            "return_code": 1,
            "tests_passed": 0,
            "tests_failed": 0,
            "tests_skipped": 0,
            "output": "FAIL repository_before (Not Implemented)",
        }

    print(f"\n{'-'*70}")
    print(f"  Running Tests for repository_{repo_type}...")
    print(f"{'-'*70}")

    # Tests are in 'tests/' directory
    tests_dir = os.path.join(ROOT_DIR, "tests")
    if not os.path.exists(tests_dir):
         return {
            "passed": False,
            "return_code": 1,
            "tests_passed": 0,
            "tests_failed": 0, 
            "tests_skipped": 0,
            "output": f"Test directory not found: {tests_dir}"
        }

    # Install pip requirements if needed (assuming they are installed in the environment already or managed by docker)
    # But let's check properly.
    
    cmd = ["pytest"]
    env = os.environ.copy()
    env["PYTHONPATH"] = ROOT_DIR # Ensure root is in path to find repository_after
    
    print(f"  Command: {' '.join(cmd)}")
    print(f"  CWD: {ROOT_DIR}")

    try:
        result = subprocess.run(
            cmd,
            cwd=ROOT_DIR,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            env=env
        )
        
        output = result.stdout
        print(output)
        
        parsed = parse_pytest_output(output)
        success = (result.returncode == 0)
        
        return {
            "passed": success,
            "return_code": result.returncode,
            "tests_passed": parsed["tests_passed"],
            "tests_failed": parsed["tests_failed"],
            "tests_skipped": parsed["tests_skipped"],
            "output": output[:50000] 
        }

    except Exception as e:
        print(f"Error executing tests: {e}")
        return {
            "passed": False,
            "return_code": 1,
            "tests_passed": 0,
            "tests_failed": 0, 
            "tests_skipped": 0,
            "output": str(e)
        }

def print_test_summary(name, result):
    if not result:
        print(f"\n{'-'*35}")
        print(f"  {name}")
        print(f"{'-'*35}")
        print("  Status:          SKIPPED (Empty/Null)")
        return

    status = "✅ PASS" if result["passed"] else "❌ FAIL"
    print(f"\n{'-'*35}")
    print(f"  {name}")
    print(f"{'-'*35}")
    print(f"  Status:          {status}")
    print(f"  Tests Passed:    {result.get('tests_passed', 0)}")
    print(f"  Tests Failed:    {result.get('tests_failed', 0)}")
    print(f"  Return Code:     {result.get('return_code', 'N/A')}")

def run_evaluation():
    run_id = str(uuid.uuid4())
    start_time = datetime.utcnow()
    
    print("="*70)
    print("  TRANSACTION INTELLIGENCE ENGINE EVALUATION")
    print("="*70)
    
    print(f"\n  Run ID:     {run_id}")
    print(f"  Started:    {start_time.isoformat()}Z")
    print(f"  Python:     {platform.python_version()}")
    print(f"  Platform:   {platform.platform()}")
    
    in_docker = os.path.exists("/.dockerenv")
    print(f"  Environment: {'Docker container' if in_docker else 'Host system'}")

    # 1. Test Before (Skipped/Simulated)
    print("\n  [1/2] Testing repository_before (skipped/empty)...")
    before_result = {
        "tests": {
            "passed": False,
            "return_code": 1,
            "tests_passed": 0,
            "tests_failed": 0,
            "tests_skipped": 0,
            "output": "repository_before does not exist"
        },
        "metrics": {}
    }

    # 2. Test After
    print("\n  [2/2] Testing repository_after...")
    after_tests = run_tests("after")
    
    after_result = {
        "tests": after_tests,
        "metrics": {}
    }

    # Comparison
    passed_gate = after_tests["passed"]
    improvement_summary = ""
    if passed_gate:
        improvement_summary = f"Optimization successful: repository_after passes {after_tests['tests_passed']} tests."
    else:
        improvement_summary = "Failed: repository_after has failures or errors."

    comparison = {
        "before_passed": False,
        "after_passed": passed_gate,
        "passed_gate": passed_gate,
        "improvement_summary": improvement_summary
    }

    end_time = datetime.utcnow()
    duration = (end_time - start_time).total_seconds()

    final_report = {
        "run_id": run_id,
        "started_at": start_time.isoformat() + "Z",
        "finished_at": end_time.isoformat() + "Z",
        "duration_seconds": duration,
        "environment": get_environment_info(),
        "before": before_result,
        "after": after_result,
        "comparison": comparison,
        "success": passed_gate,
        "error": None
    }

    # Save
    date_str = start_time.strftime("%Y-%m-%d")
    time_str = start_time.strftime("%H-%M-%S")
    report_subdir = os.path.join(REPORTS_DIR, date_str, time_str)
    os.makedirs(report_subdir, exist_ok=True)
    
    report_path = os.path.join(report_subdir, "report.json")
    with open(report_path, "w") as f:
        json.dump(final_report, f, indent=2)

    # Summary Output
    print(f"\n{'-'*70}")
    print("  RESULTS SUMMARY")
    print(f"{'-'*70}")
    
    print_test_summary("repository_before (unoptimized)", before_result["tests"] if before_result else None)
    print_test_summary("repository_after (optimized)", after_result["tests"])
    
    print(f"\n{'-'*70}")
    print("  COMPARISON")
    print(f"{'-'*70}")
    
    gate_status = "✅ PASSED" if passed_gate else "❌ FAILED"
    print(f"\n  Optimization Gate:     {gate_status}")
    print(f"  Summary: {improvement_summary}")
    
    print(f"\n  Report saved to: {report_path}")
    print(f"\n{'='*70}")
    if passed_gate:
        print("  ✅ EVALUATION SUCCESSFUL ✅")
    else:
        print("  ❌ EVALUATION FAILED ❌")
    print(f"{'='*70}\n")
    
    if not passed_gate:
        sys.exit(1)

if __name__ == "__main__":
    try:
        run_evaluation()
    except Exception as e:
        print(f"\n❌ Evaluation failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
