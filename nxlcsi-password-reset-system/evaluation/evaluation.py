#!/usr/bin/env python3
import os
import json
import subprocess
import sys
import datetime
import socket
import platform
import random
import string
import re
from pathlib import Path

# =================================================================
# EVALUATION CONFIGURATION
# =================================================================
TASK_NAME = "Password Reset System"
TEST_FILE_API = "tests/api/test_password_reset.py"
TEST_FILE_CLIENT = "tests/client/app.test.jsx"
EVALUATION_DIR = Path(__file__).parent
REPOSITORY_AFTER = "repository_after"

def generate_run_id() -> str:
    """Generate a unique run ID."""
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=8))

def get_git_info():
    """Extract git info safely."""
    git_info = {"git_commit": "unknown", "git_branch": "unknown"}
    try:
        git_info["git_commit"] = subprocess.check_output(["git", "rev-parse", "HEAD"], stderr=subprocess.DEVNULL, text=True).strip()[:8]
        git_info["git_branch"] = subprocess.check_output(["git", "rev-parse", "--abbrev-ref", "HEAD"], stderr=subprocess.DEVNULL, text=True).strip()
    except Exception:
        pass
    return git_info

def get_environment_info():
    """Get detailed environment information."""
    git_info = get_git_info()
    return {
        "python_version": platform.python_version(),
        "platform": platform.platform(),
        "os": platform.system(),
        "os_release": platform.release(),
        "architecture": platform.machine(),
        "hostname": socket.gethostname(),
        "git_commit": git_info["git_commit"],
        "git_branch": git_info["git_branch"]
    }

def run_pytest(test_file: str, repo_path: str):
    """Run pytest tests."""
    print(f"\n{'='*60}")
    print(f"RUNNING API TESTS: {repo_path}")
    print(f"{'='*60}")

    env = os.environ.copy()
    env["REPO_PATH"] = repo_path

    cmd = ["pytest", "-v", test_file]

    try:
        result = subprocess.run(cmd, env=env, capture_output=True, text=True, encoding='utf-8')
        stdout = result.stdout
        stderr = result.stderr
        exit_code = result.returncode

        test_results = []
        matches = re.findall(r"^(tests/.*::\S+)\s+(PASSED|FAILED|ERROR|SKIPPED)", stdout, re.MULTILINE)

        for nodeid, status in matches:
            test_results.append({
                "nodeid": nodeid,
                "name": nodeid.split("::")[-1],
                "outcome": status.lower()
            })

        summary = {"total": 0, "passed": 0, "failed": 0, "errors": 0, "skipped": 0}
        
        last_line_match = re.search(r"==+ (.*) in [\d\.]+s ==+", stdout)
        if last_line_match:
            parts = last_line_match.group(1).split(", ")
            for part in parts:
                count_match = re.match(r"(\d+)\s+(\w+)", part.strip())
                if count_match:
                    count = int(count_match.group(1))
                    category = count_match.group(2)
                    if category == "passed":
                        summary["passed"] += count
                    elif category == "failed":
                        summary["failed"] += count
                    elif category == "error":
                        summary["errors"] += count
                    elif category == "skipped":
                        summary["skipped"] += count
            summary["total"] = sum(summary.values())
        else:
            if len(test_results) > 0:
                summary["passed"] = len([t for t in test_results if t['outcome'] == 'passed'])
                summary["failed"] = len([t for t in test_results if t['outcome'] in ['failed', 'error']])
                summary["total"] = len(test_results)

        success = (summary["failed"] == 0 and summary["errors"] == 0)

        return {
            "success": success,
            "exit_code": exit_code,
            "tests": test_results,
            "summary": summary,
            "stdout": stdout,
            "stderr": stderr
        }

    except Exception as e:
        return {
            "success": False,
            "exit_code": 1,
            "tests": [],
            "summary": {"total": 0, "passed": 0, "failed": 0, "errors": 1, "skipped": 0},
            "stdout": "",
            "stderr": str(e)
        }

def run_jest(test_file: str, repo_path: str):
    """Run Jest tests."""
    print(f"\n{'='*60}")
    print(f"RUNNING CLIENT TESTS: {repo_path}")
    print(f"{'='*60}")

    client_dir = Path(repo_path) / "client"
    cmd = ["npm", "test", "--", "--passWithNoTests"]

    try:
        result = subprocess.run(cmd, cwd=client_dir, capture_output=True, text=True, encoding='utf-8')
        stdout = result.stdout
        stderr = result.stderr
        exit_code = result.returncode

        # Combine stdout and stderr for parsing (npm/Jest may output to either)
        combined_output = stdout + "\n" + stderr

        test_results = []
        summary = {"total": 0, "passed": 0, "failed": 0, "errors": 0, "skipped": 0}
        
        # Parse Jest output: "Tests:       6 passed, 6 total"
        test_match = re.search(r"Tests:\s+(\d+)\s+passed,\s+(\d+)\s+total", combined_output)
        if test_match:
            summary["passed"] = int(test_match.group(1))
            summary["total"] = int(test_match.group(2))
            summary["failed"] = summary["total"] - summary["passed"]
        
        success = exit_code == 0 and summary["total"] > 0

        return {
            "success": success,
            "exit_code": exit_code,
            "tests": test_results,
            "summary": summary,
            "stdout": stdout,
            "stderr": stderr
        }

    except Exception as e:
        return {
            "success": False,
            "exit_code": 1,
            "tests": [],
            "summary": {"total": 0, "passed": 0, "failed": 0, "errors": 1, "skipped": 0},
            "stdout": "",
            "stderr": str(e)
        }

def main():
    SUCCESS_ICON = "✅"
    FAILURE_ICON = "❌"

    run_id = generate_run_id()
    started_at = datetime.datetime.now(datetime.UTC)

    print(f"\n{'='*60}")
    print(f"EVALUATION: {TASK_NAME}")
    print(f"{'='*60}")
    print(f"Run ID: {run_id}")
    print(f"Started at: {started_at.isoformat()}")

    # Run tests
    after_api = run_pytest(TEST_FILE_API, REPOSITORY_AFTER)
    after_client = run_jest(TEST_FILE_CLIENT, REPOSITORY_AFTER)

    finished_at = datetime.datetime.now(datetime.UTC)
    duration = (finished_at - started_at).total_seconds()

    # Combined results
    after_total = after_api["summary"]["total"] + after_client["summary"]["total"]
    after_passed = after_api["summary"]["passed"] + after_client["summary"]["passed"]
    after_failed = after_api["summary"]["failed"] + after_client["summary"]["failed"]
    
    success = after_api["success"] and after_client["success"]
    error_message = None if success else "Tests failed"

    report = {
        "run_id": run_id,
        "started_at": started_at.isoformat(),
        "finished_at": finished_at.isoformat(),
        "duration_seconds": float(round(duration, 6)),
        "success": success,
        "error": error_message,
        "environment": get_environment_info(),
        "results": {
            "api": after_api,
            "client": after_client,
            "summary": {
                "total": after_total,
                "passed": after_passed,
                "failed": after_failed
            }
        }
    }

    date_str = started_at.strftime("%Y-%m-%d")
    time_str = started_at.strftime("%H-%M-%S")
    output_dir = EVALUATION_DIR / date_str / time_str
    output_dir.mkdir(parents=True, exist_ok=True)
    report_path = output_dir / "report.json"

    with open(report_path, "w", encoding='utf-8') as f:
        json.dump(report, f, indent=2)

    if success:
        Path("/tmp/EVALUATION_SUCCESS").touch()
    else:
        Path("/tmp/EVALUATION_FAILED").touch()

    print(f"\n{'='*60}")
    print("EVALUATION SUMMARY")
    print(f"{'='*60}")
    
    print(f"\nAPI Tests:")
    print(f"  Overall: {SUCCESS_ICON if after_api['success'] else FAILURE_ICON}")
    print(f"  Tests: {after_api['summary']['passed']}/{after_api['summary']['total']} passed")

    print(f"\nClient Tests:")
    print(f"  Overall: {SUCCESS_ICON if after_client['success'] else FAILURE_ICON}")
    print(f"  Tests: {after_client['summary']['passed']}/{after_client['summary']['total']} passed")

    print(f"\nCombined: {after_passed}/{after_total} passed")
    print(f"\nReport saved to: {report_path}")
    print(f"{'='*60}")
    print("EVALUATION COMPLETE")
    print(f"Duration: {round(duration, 2)}s")
    print(f"Success: {'YES' if success else 'NO'}")
    print(f"{'='*60}\n")

    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()