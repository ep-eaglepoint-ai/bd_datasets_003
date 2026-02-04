
import sys
import os
import subprocess
import json
import uuid
import datetime
import time

def run_command(command, capture=False):
    """Run a shell command and return result."""
    try:
        result = subprocess.run(
            command, 
            shell=True, 
            check=False, 
            capture_output=capture, 
            text=True
        )
        return result
    except Exception as e:
        print(f"Error running command '{command}': {e}")
        return None

def parse_pytest_output(output):
    """Parse pytest output to extract passed count."""
    passed = 0
    total = 0
    failed = 0
    lines = output.splitlines()
    for line in lines:
        # Example line: "============================== 4 passed in 43.46s =============================="
        if " passed " in line and "=" in line:
            parts = line.split()
            for i, p in enumerate(parts):
                if p == "passed":
                    try:
                        passed = int(parts[i-1])
                    except: pass
                if p == "failed":
                    try:
                        failed = int(parts[i-1])
                    except: pass
    total = passed + failed
    return passed, failed, total

def print_header(title):
    print("=" * 60)
    print(title)
    print("=" * 60)

def generate_patch():
    """Generates the diff.patch file."""
    os.makedirs("/app/patches", exist_ok=True)
    # Check if directories exist
    if os.path.exists("/app/repository_before") and os.path.exists("/app/repository_after"):
        cmd = "git diff --no-index repository_before repository_after > patches/diff.patch"
        # git diff --no-index exits with 1 if there are differences, 0 if none.
        # We don't want to crash if there are differences (which is expected).
        subprocess.run(cmd, shell=True) 
    else:
        print("Warning: repository directories not found for patch generation.")

def run_tests_cmd():
    print_header("RUNNING PRIMARY TESTS")
    print("Test location: repository_after")
    
    cmd = "pytest repository_after/test_raft_chaos.py"
    # Execute with live output
    res = subprocess.run(cmd, shell=True)
    return res.returncode

def run_metatests_cmd():
    print_header("RUNNING META-TESTS")
    print("Meta-tests directory: /app/tests")
    
    cmd = "pytest tests/test_meta.py"
    res = subprocess.run(cmd, shell=True)
    return res.returncode

def evaluate_cmd():
    run_id = str(uuid.uuid4())
    start_time = datetime.datetime.now()
    start_iso = start_time.isoformat()
    
    print(f"Run ID: {run_id}")
    print(f"Started at: {start_iso}")
    print("")
    print_header("RAFT CONSENSUS TEST EVALUATION")
    print("")
    
    # Run Primary Tests
    print_header("RUNNING PRIMARY TESTS")
    print("Test location: repository_after")
    p_res = run_command("pytest repository_after/test_raft_chaos.py", capture=True)
    print(p_res.stdout)
    if p_res.stderr:
        print(p_res.stderr)
        
    p_passed, p_failed, p_total = parse_pytest_output(p_res.stdout)
    p_status = "PASSED" if p_res.returncode == 0 and p_passed > 0 else "FAILED"
    
    print("")
    
    # Run Meta Tests
    print_header("RUNNING META-TESTS")
    print("Meta-tests directory: /app/tests")
    m_res = run_command("pytest tests/test_meta.py", capture=True)
    print(m_res.stdout)
    if m_res.stderr:
        print(m_res.stderr)
        
    m_passed, m_failed, m_total = parse_pytest_output(m_res.stdout)
    m_status = "PASSED" if m_res.returncode == 0 and m_passed > 0 else "FAILED"
    
    print("")
    print_header("EVALUATION SUMMARY")
    print("")
    print("Primary Tests:")
    print(f"  Overall: {p_status}")
    print(f"  Tests: {p_passed}/{p_total} passed")
    print("")
    print("Meta-Tests:")
    print(f"  Overall: {m_status}")
    print(f"  Tests: {m_passed}/{m_total} passed")
    print("")
    print_header("EXPECTED BEHAVIOR CHECK")
    
    checks_ok = True
    if p_status == "PASSED":
        print("[✓ OK] Primary tests passed")
    else:
        print("[X FAIL] Primary tests failed")
        checks_ok = False
        
    if m_status == "PASSED":
        print("[✓ OK] Meta-tests passed")
    else:
        print("[X FAIL] Meta-tests failed")
        checks_ok = False
        
    # Generate Patch
    generate_patch()
    
    # Save Report
    end_time = datetime.datetime.now()
    duration = (end_time - start_time).total_seconds()
    
    report_dir = f"evaluation/reports/{start_time.strftime('%Y-%m-%d/%H-%M-%S')}"
    os.makedirs(report_dir, exist_ok=True)
    report_path = os.path.join(report_dir, "report.json")
    
    report_data = {
        "run_id": run_id,
        "task_title": "Raft Consensus Chaos Testing",
        "start_time": start_iso,
        "end_time": end_time.isoformat(),
        "duration_seconds": duration,
        "primary_test_results": {"passed": p_passed, "failed": p_failed, "total": p_total},
        "meta_test_results": {"passed": m_passed, "failed": m_failed, "total": m_total},
        "overall_status": "SUCCESS" if checks_ok else "FAILURE",
        "execution_environment": "docker"
    }
    
    with open(report_path, "w") as f:
        json.dump(report_data, f, indent=4)
        
    print(f"Report saved to:\n{report_path}")
    print("")
    print_header("EVALUATION COMPLETE")
    print(f"Run ID: {run_id}")
    print(f"Duration: {duration:.2f}s")
    print(f"Success: {'YES' if checks_ok else 'NO'}")
    
    if not checks_ok:
        sys.exit(1)

def main():
    if len(sys.argv) < 2:
        print("Usage: runner.py <command>")
        sys.exit(1)
        
    cmd = sys.argv[1]
    
    if cmd == "run-tests":
        sys.exit(run_tests_cmd())
    elif cmd == "run-metatests":
        sys.exit(run_metatests_cmd())
    elif cmd == "evaluate":
        evaluate_cmd()
    else:
        print(f"Unknown command: {cmd}")
        sys.exit(1)

if __name__ == "__main__":
    main()
