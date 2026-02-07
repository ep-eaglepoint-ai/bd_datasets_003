import json
import os
import platform
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path

def generate_run_id() -> str:
    return "run-fixed"

def get_environment_info() -> dict:
    return {
        "python_version": sys.version.split()[0],
        "platform": platform.platform(),
        "os_type": platform.system(),
        "execution_mode": "Inside Docker Container"
        if os.getenv("INSIDE_DOCKER") == "true"
        else "Host Machine",
    }

def generate_output_path() -> Path:
    output_dir = Path("/app/evaluation/reports")
    output_dir.mkdir(parents=True, exist_ok=True)
    return output_dir / "report.json"

def parse_junit(junit_path: Path) -> list[dict]:
    tests = []
    if not junit_path.exists():
        return tests
        
    try:
        tree = ET.parse(junit_path)
        root = tree.getroot()

        for testcase in root.iter("testcase"):
            name = testcase.attrib.get("name", "unknown")
            suite = testcase.attrib.get("classname", "unknown")
            outcome = "passed"
            for child in testcase:
                if child.tag in {"failure", "error"}:
                    outcome = "failed"
                    break
                if child.tag == "skipped":
                    outcome = "skipped"
                    break
            tests.append({"suite": suite, "name": name, "outcome": outcome})
    except Exception as e:
        print(f"Error parsing junit: {e}")
    return tests

def run_tests(target: str) -> dict:
    junit_path = Path("/tmp") / f"pytest-{target}.xml"
    
    test_dir = "tests"
    
    if target == "before":
        # Hack: The tests likely depend on imports from 'app'. 
        # 'repository_before/app' exists but is empty/skeleton.
        # So I can try running pytest by setting PYTHONPATH to repository_before.
        cwd = "../repository_before"
        # Since I am in repository_after (implied working dir), I go up one level?
        # Docker context is usually root of the whole thing?
        # The folders are:
        # z1erb8.../
        #   repository_after/
        #   repository_before/
        #   evaluation/
        
        # If I run docker from root z1erb8...
        # I can mount both.
        # Let's assume the script runs in a container where:
        # /app/repository_after -> code
        # /app/repository_before -> code
        # /app/tests -> tests (Assuming tests are in repository_after/tests)
        
        # For 'before' run:
        # PYTHONPATH=/app/repository_before pytest /app/tests
        
        env = {**os.environ, "PYTHONPATH": "/app/repository_before", "CI": "true"}
        test_path = "/app/tests"
        command = ["pytest", "-q", "-vv", test_path, f"--junitxml={junit_path}"]
        
    else: # target == "after"
        env = {**os.environ, "PYTHONPATH": "/app/repository_after", "CI": "true"}
        test_path = "/app/tests"
        command = ["pytest", "-q", "-vv", test_path, f"--junitxml={junit_path}"]

    print(f"Running tests for target: {target} with command: {' '.join(command)}")
    
    # We might need to install test deps if they differ? Assuming same env.
    
    start_time = time.time()
    result = subprocess.run(
        command,
        capture_output=True,
        text=True,
        env=env,
    )

    tests = parse_junit(junit_path)
    summary = {
        "total": len(tests),
        "passed": len([t for t in tests if t["outcome"] == "passed"]),
        "failed": len([t for t in tests if t["outcome"] == "failed"]),
        "skipped": len([t for t in tests if t["outcome"] == "skipped"]),
        "errors": 1 if result.returncode != 0 and not tests else 0,
    }

    return {
        "success": result.returncode == 0,
        "return_code": result.returncode,
        "tests": tests,
        "summary": summary,
        "stdout": result.stdout,
        "stderr": result.stderr,
        "duration_ms": int((time.time() - start_time) * 1000),
    }

def map_criteria(tests: list[dict]) -> dict:
    def check(fragment: str) -> str:
        matching = [t for t in tests if fragment in t["name"]]
        if not matching:
            return "Not Run"
        return "Fail" if any(t["outcome"] == "failed" for t in matching) else "Pass"

    # Mapping requirements to test functions
    mapping = {
        "req_1_async_delivery": "test_async_delivery_trigger",
        "req_2_backoff_retry": "test_delivery_failure_retry_logic",
        "req_3_hmac_signature": "test_delivery_execution_success",
        "req_4_delivery_logs": "test_delivery_failure_retry_logic",
        "req_5_disable_endpoint": "test_disable_endpoint_after_failures",
        "req_6_idempotency": "test_idempotency_keys",
        "req_8_manual_retry": "test_manual_retry",
        "req_9_event_filtering": "test_event_filtering",
        "req_10_history_api": "test_delivery_history",
        "req_11_timeout": "test_timeout_compliance",
        "req_12_jitter": "test_calculate_next_retry", # from unit test name which defaults to file? No, pytest junit uses function name
        "req_13_metadata": "test_delivery_execution_success",
        "req_14_secrets": "test_delivery_execution_success", # covered indirectly or check unit tests
        "req_15_tests": "test_" # General check if tests ran
    }
    
    result = {}
    for req_id, test_name_fragment in mapping.items():
        result[req_id] = check(test_name_fragment)
        
    return result

def main() -> None:
    run_id = generate_run_id()
    start_ts = time.time()
    started_at = datetime.utcnow().isoformat() + "Z"

    # We expect the container to have mounted repo_before and repo_after
    before_results = run_tests("before")
    after_results = run_tests("after")

    end_ts = time.time()
    finished_at = datetime.utcnow().isoformat() + "Z"
    duration = end_ts - start_ts

    before_passed = before_results["summary"]["failed"] == 0 and before_results["summary"]["errors"] == 0 and before_results["summary"]["total"] > 0
    after_passed = after_results["summary"]["failed"] == 0 and after_results["summary"]["errors"] == 0 and after_results["summary"]["total"] > 0
    
    # Requirement: "before" should fail (it's empty), "after" should pass.
    # If before has 0 tests (import error or collection error), it counts as failure in this context effectively?
    # Usually "before" fails because code is missing.
    # If before_results["return_code"] != 0, it failed.
    before_actually_failed = before_results["return_code"] != 0 or before_results["summary"]["failed"] > 0
    
    passed_gate = after_passed and before_actually_failed
    
    improvement_summary = ""
    if passed_gate:
        improvement_summary = "Repository after passes all correctness tests while repository before fails as expected."
    elif after_passed:
        improvement_summary = "Repository after passes tests, but repository before also passed (unexpected)."
    else:
        improvement_summary = "Repository after failed tests."

    report = {
        "run_id": run_id,
        "started_at": started_at,
        "finished_at": finished_at,
        "duration_seconds": duration,
        "environment": get_environment_info(),
        "before": {
            "tests": {
                "passed": not before_actually_failed,
                "return_code": before_results["return_code"],
                "output": before_results["stdout"] + "\n" + before_results.get("stderr", "")
            },
            "test_cases": before_results["tests"],
            "criteria_analysis": map_criteria(before_results["tests"]),
            "metrics": {}
        },
        "after": {
             "tests": {
                "passed": after_passed,
                "return_code": after_results["return_code"],
                "output": after_results["stdout"] + "\n" + after_results.get("stderr", "")
            },
            "test_cases": after_results["tests"],
            "criteria_analysis": map_criteria(after_results["tests"]),
            "metrics": {}
        },
        "comparison": {
            "passed_gate": passed_gate,
            "improvement_summary": improvement_summary
        },
        "success": passed_gate,
        "error": None
    }

    output_path = generate_output_path()
    output_path.write_text(json.dumps(report, indent=2))
    
    print(json.dumps(report, indent=2))

if __name__ == "__main__":
    main()
