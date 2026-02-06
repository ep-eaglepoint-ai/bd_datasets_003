import os
import json
import uuid
import platform
import datetime
import subprocess
import sys

def run_evaluation():
    # Target Python 3.10+ as per requirement
    if sys.version_info < (3, 10):
        print(f"CRITICAL ERROR: Evaluation must run on Python 3.10+. Current version: {sys.version}")
        sys.exit(1)
        
    started_at = datetime.datetime.now(datetime.timezone.utc)
    
    # Run pytest with json-report
    # We use a temporary file for the raw report
    temp_report = "temp_report.json"
    
    try:
        # Run tests and capture output
        pytest_cmd = [sys.executable, "-m", "pytest", "--json-report", f"--json-report-file={temp_report}", "-q", "tests"]
        process = subprocess.run(
            pytest_cmd,
            capture_output=True,
            text=True
        )
        success = True
        error_msg = None
        exit_code = process.returncode
    except Exception as e:
        success = False
        error_msg = str(e)
        exit_code = 1

    finished_at = datetime.datetime.now(datetime.timezone.utc)
    duration = (finished_at - started_at).total_seconds()

    # Read the raw report if it exists
    test_results = []
    summary = {"total": 0, "passed": 0, "failed": 0, "xfailed": 0, "errors": 0, "skipped": 0}
    
    if os.path.exists(temp_report):
        with open(temp_report, 'r') as f:
            raw_data = json.load(f)
            
            # Map tests
            for test in raw_data.get('tests', []):
                # Aggregate duration from all phases
                test_duration = sum(test.get(p, {}).get('duration', 0) for p in ['setup', 'call', 'teardown'])
                test_results.append({
                    "name": test.get('nodeid'),
                    "status": test.get('outcome'),
                    "duration": test_duration,
                    "failureMessages": [test.get('call', {}).get('longrepr')] if test.get('outcome') == 'failed' else []
                })
            
            # Map summary
            s = raw_data.get('summary', {})
            summary = {
                "total": s.get('total', 0),
                "passed": s.get('passed', 0),
                "failed": s.get('failed', 0),
                "xfailed": s.get('xfailed', 0),
                "errors": s.get('error', 0),
                "skipped": s.get('skipped', 0)
            }
        os.remove(temp_report)
    else:
        success = False
        if not error_msg:
            error_msg = "Pytest did not generate a report."

    # Construct final report
    report = {
        "run_id": str(uuid.uuid4()),
        "started_at": started_at.isoformat().replace('+00:00', 'Z'),
        "finished_at": finished_at.isoformat().replace('+00:00', 'Z'),
        "duration_seconds": duration,
        "success": success,
        "error": error_msg,
        "environment": {
            "python_version": sys.version.split()[0],
            "platform": sys.platform,
            "os": platform.system(),
            "architecture": platform.machine(),
            "hostname": platform.node()
        },
        "results": {
            "after": {
                "success": exit_code == 0,
                "exit_code": exit_code,
                "tests": test_results,
                "summary": summary
            },
            "comparison": {
                "after_tests_passed": exit_code == 0,
                "after_total": summary["total"],
                "after_passed": summary["passed"],
                "after_failed": summary["failed"],
                "after_xfailed": summary["xfailed"]
            }
        }
    }

    # Prepare directory: /evaluation/yyyy-mm-dd/hh-mm-ss/
    timestamp_dir = started_at.strftime("%Y-%m-%d/%H-%M-%S")
    target_dir = os.path.join("evaluation", timestamp_dir)
    os.makedirs(target_dir, exist_ok=True)
    
    report_path = os.path.join(target_dir, "report.json")
    with open(report_path, 'w') as f:
        json.dump(report, f, indent=2)
    
    print(f"Report generated at: {report_path}")

if __name__ == "__main__":
    run_evaluation()
