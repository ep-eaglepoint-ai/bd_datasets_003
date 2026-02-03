import json
import os
import sys
import subprocess
import time
import datetime
import re
import platform

def generate_run_id():
    return "test_run_001"

def get_environment_info():
    return {
        "python_version": sys.version,
        "platform": platform.system(),
        "os_type": os.name,
        "execution_mode": "Inside Docker Container" if os.environ.get("INSIDE_DOCKER") else "Host Machine"
    }

def generate_output_path(project_root, custom_path=None):
    if custom_path:
        return os.path.abspath(custom_path)
    
    now = datetime.datetime.now()
    date_str = now.strftime("%Y-%m-%d")
    time_str = now.strftime("%H-%M-%S")
    
    # Write to evaluation/reports relative to this script
    eval_dir = os.path.dirname(os.path.abspath(__file__))
    output_dir = os.path.join(eval_dir, "reports", date_str, time_str)
    
    os.makedirs(output_dir, exist_ok=True)
    return os.path.join(output_dir, "report.json")

def parse_pytest_output(stdout, stderr):
    tests = []
    # Combine outputs and remove ANSI codes
    full_output = stdout + "\n" + stderr
    ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
    clean_output = ansi_escape.sub('', full_output)
    
    # Pytest verbose output looks like:
    # tests/test_whitening.py::TestWhiteningTransformer::test_centering_toggle PASSED [ 12%]
    
    # Regex to capture test name and result
    # We look for lines containing "tests/test_whitening.py::"
    test_line_pattern = re.compile(r'tests/.*::(\w+)::(\w+)\s+(PASSED|FAILED|ERROR|SKIPPED)')
    
    for line in clean_output.split('\n'):
        match = test_line_pattern.search(line)
        if match:
            suite_name = match.group(1)
            test_name = match.group(2)
            result_str = match.group(3)
            
            outcome = "passed" if result_str == "PASSED" else "failed"
            # ERROR and SKIPPED treated as failed or separate? Treating as failed for strictness
            if result_str in ["ERROR", "SKIPPED"]:
                outcome = "failed"
                
            tests.append({
                "suite": suite_name,
                "name": test_name,
                "outcome": outcome
            })
            
    # Verify we found some tests. If not, maybe use a fallback parser or check for collection errors
    # But with verbose flag -v, it should work.
    return tests

def run_evaluation_tests():
    print("🚀 Starting Integration Tests...")
    
    env = os.environ.copy()
    env["CI"] = "true" # Force non-interactive

    # If inside docker, run pytest directly. 
    # If host, assume we want to run the test logic directly as well (assuming env is set up) 
    # OR follow the JS pattern of calling docker-compose. 
    # The prompt says: "If false, we run docker compose."
    
    if os.environ.get("INSIDE_DOCKER") == "true":
        print("   (Running inside container: executing 'pytest')")
        command = ["pytest", "-v", "tests"]
    else:
        print("   (Running on host: executing 'docker compose')")
        # Ensure we point to the right compose file service
        command = ["docker", "compose", "run", "--rm", "test-runner"]

    start_time = time.time()
    
    try:
        # Capture output
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            env=env,
            timeout=120
        )
        
        output = result.stdout
        error_output = result.stderr
        
        tests = parse_pytest_output(output, error_output)
        
        passed_count = sum(1 for t in tests if t["outcome"] == "passed")
        failed_count = sum(1 for t in tests if t["outcome"] == "failed")
        
        summary = {
            "total": len(tests),
            "passed": passed_count,
            "failed": failed_count,
            "errors": 1 if result.returncode != 0 and len(tests) == 0 else 0
        }
        
        success = (result.returncode == 0) or (passed_count > 0 and failed_count == 0)
        
        return {
            "success": success,
            "exit_code": result.returncode,
            "tests": tests,
            "summary": summary,
            "stdout": output,
            "stderr": error_output,
            "duration_ms": int((time.time() - start_time) * 1000)
        }

    except Exception as e:
        return {
            "success": False,
            "exit_code": -1,
            "tests": [],
            "summary": {"total": 0, "passed": 0, "failed": 0, "errors": 1},
            "stdout": "",
            "stderr": str(e)
        }

def map_criteria(tests):
    def check(name_fragments):
        if isinstance(name_fragments, str):
            name_fragments = [name_fragments]
            
        matching_tests = [
            t for t in tests 
            if any(frag.lower() in t["name"].lower() for frag in name_fragments)
        ]
        
        if not matching_tests:
            return "Not Run"
            
        has_failure = any(t["outcome"] == "failed" for t in matching_tests)
        return "Fail" if has_failure else "Pass"

    return {
        "Input Validation": check("validation"),
        "PCA Whitening": check("pca_whitening"),
        "ZCA Whitening": check("zca_whitening"),
        "Centering": check("centering"),
        "Dimensionality Reduction": check("dimensionality"),
        "Inverse Transform": check(["reconstruction", "inverse"]),
        "Regularization": check(["regularization", "shrinkage"]),
        "Numerical Stability": check(["stability", "numerical"]),
        "Scikit-learn API": check(["fit_transform"]), # Implicitly tested
    }

def main():
    run_id = generate_run_id()
    project_root = os.getcwd()
    
    print(f"Starting Whitening Module Evaluation [Run ID: {run_id}]")
    
    results = run_evaluation_tests()
    criteria_analysis = map_criteria(results["tests"])
    
    report = {
        "run_id": run_id,
        "tool": "Whitening Module Evaluator",
        "started_at": datetime.datetime.now().isoformat(),
        "environment": get_environment_info(),
        "before": None,
        "after": results,
        "criteria_analysis": criteria_analysis,
        "comparison": {
            "summary": "Containerized Evaluation",
            "success": results["success"]
        }
    }
    
    output_path = generate_output_path(project_root)
    
    with open(output_path, 'w') as f:
        json.dump(report, f, indent=2)
        
    print("\n---------------------------------------------------")
    print(f"Tests Run: {results['summary']['total']}")
    print(f"Passed:    {results['summary']['passed']}")
    print(f"Failed:    {results['summary']['failed']}")
    print("---------------------------------------------------")
    print(f"✅ Report saved to: {output_path}")

if __name__ == "__main__":
    main()
