import json
import os
import sys
import subprocess
import time
import datetime
import re
import platform
import uuid

def generate_run_id():
    return str(uuid.uuid4())

def get_environment_info():
    return {
        "python_version": sys.version.split()[0], # formatted as 3.8.10
        "platform": platform.platform() 
    }

def generate_output_path(project_root):
    # Write to evaluation/reports relative to this script
    eval_dir = os.path.dirname(os.path.abspath(__file__))
    # structure: evaluation/reports/report.json 
    output_dir = os.path.join(eval_dir, "reports")
    os.makedirs(output_dir, exist_ok=True)
    return os.path.join(output_dir, "report.json")

def parse_pytest_output(stdout, stderr):
    test_cases = []
    # Combine outputs and remove ANSI codes
    full_output = stdout + "\n" + stderr
    ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
    clean_output = ansi_escape.sub('', full_output)
    
    # Regex to capture test name and result
    # We look for lines containing "tests/test_whitening.py::" or similar
    test_line_pattern = re.compile(r'(tests/.*::\w+)\s+(PASSED|FAILED|ERROR|SKIPPED)')
    
    for line in clean_output.split('\n'):
        match = test_line_pattern.search(line)
        if match:
            full_test_name = match.group(1)
            result_str = match.group(2)
            
            outcome = "passed" if result_str == "PASSED" else "failed"
            if result_str in ["ERROR", "SKIPPED"]:
                outcome = "failed" # simplifying for pass/fail gate
                
            test_cases.append({
                "name": full_test_name,
                "outcome": outcome
            })
            
    return test_cases, full_output

def run_tests_execution():
    env = os.environ.copy()
    env["CI"] = "true" 

    if os.environ.get("INSIDE_DOCKER") == "true":
        print("   (Running inside container: executing 'pytest')")
        command = ["pytest", "-v", "tests"]
    else:
        print("   (Running on host: executing 'docker compose')")
        # Fixed: use 'app' instead of 'test-runner'
        command = ["docker", "compose", "run", "--rm", "app", "pytest", "-v", "tests"]

    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            env=env,
            timeout=120
        )
        return result.returncode, result.stdout, result.stderr
    except Exception as e:
        return -1, "", str(e)

def format_test_result(return_code, stdout, stderr):
    test_cases, full_output = parse_pytest_output(stdout, stderr)
    
    # Passed if return code is 0 (pytest exit code 0 means all collected tests passed)
    passed = (return_code == 0)
    
    return {
        "tests": {
            "passed": passed,
            "return_code": return_code,
            "output": full_output,
            "test_cases": test_cases
        },
        "metrics": {}
    }

def main():
    start_time = datetime.datetime.now(datetime.timezone.utc)
    start_t = time.time()
    
    run_id = generate_run_id()
    project_root = os.getcwd()
    
    print(f"Starting Evaluation [Run ID: {run_id}]")
    
    # 1. BEFORE (Static Failure for missing/empty repo)
    before_result = {
        "tests": {
            "passed": False,
            "return_code": 1,
            "output": "Pre-check: repository_before is empty. Automated failure.",
            "test_cases": []
        },
        "metrics": {}
    }
    
    # 2. AFTER (Actual execution)
    return_code, stdout, stderr = run_tests_execution()
    after_result = format_test_result(return_code, stdout, stderr)
    
    end_time = datetime.datetime.now(datetime.timezone.utc)
    end_t = time.time()
    duration = end_t - start_t
    
    # 3. COMPARISON
    passed_gate = after_result["tests"]["passed"]
    
    comparison = {
        "passed_gate": passed_gate,
        "improvement_summary": "Tests passed successfully in 'after' state." if passed_gate else "Tests failed in 'after' state."
    }
    
    success = passed_gate
    
    report = {
        "run_id": run_id,
        "started_at": start_time.strftime('%Y-%m-%dT%H:%M:%S.%fZ') + "Z",
        "finished_at": end_time.strftime('%Y-%m-%dT%H:%M:%S.%fZ') + "Z",
        "duration_seconds": duration,
        "environment": get_environment_info(),
        "before": before_result,
        "after": after_result,
        "comparison": comparison,
        "success": success,
        "error": None
    }
    
    output_path = generate_output_path(project_root)
    
    with open(output_path, 'w') as f:
        json.dump(report, f, indent=2)
        
    print("\n---------------------------------------------------")
    print(f"Status:    {'✅ PASSED' if success else '❌ FAILED'}")
    print(f"Duration:  {duration:.2f}s")
    print("---------------------------------------------------")
    print(f"✅ Report saved to: {output_path}")
    
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
