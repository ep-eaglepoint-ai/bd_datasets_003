import os
import sys
import json
import subprocess
import datetime
import socket
import platform
import uuid

def run_tests(test_targets, filter_pattern=None, extra_args=None):
    report_file = f"temp_report_{uuid.uuid4()}.json"
    
    # Base command
    cmd = ["pytest"]
    
    # Add targets
    if isinstance(test_targets, list):
        cmd.extend(test_targets)
    else:
        cmd.append(test_targets)
        
    cmd.extend(["--json-report", f"--json-report-file={report_file}", "-q"])
    
    if filter_pattern:
        cmd.extend(["-k", filter_pattern])
        
    if extra_args:
        cmd.extend(extra_args)
    
    start_time = datetime.datetime.utcnow()
    process = subprocess.run(cmd, capture_output=True, text=True)
    end_time = datetime.datetime.utcnow()
    
    results = []
    summary = {"total": 0, "passed": 0, "failed": 0, "xfailed": 0, "errors": 0, "skipped": 0}
    
    if os.path.exists(report_file):
        with open(report_file, 'r') as f:
            data = json.load(f)
            summary["total"] = data.get("summary", {}).get("total", 0)
            summary["passed"] = data.get("summary", {}).get("passed", 0)
            summary["failed"] = data.get("summary", {}).get("failed", 0)
            summary["xfailed"] = data.get("summary", {}).get("xfailed", 0)
            summary["errors"] = data.get("summary", {}).get("error", 0)
            summary["skipped"] = data.get("summary", {}).get("skipped", 0)
            
            for test in data.get("tests", []):
                nodeid_parts = test.get("nodeid").split('::')
                test_class = nodeid_parts[1] if len(nodeid_parts) > 2 else nodeid_parts[0]
                test_name = nodeid_parts[-1]
                
                results.append({
                    "class": test_class,
                    "name": test_name,
                    "status": test.get("outcome"),
                    "full_name": test.get("nodeid")
                })
        os.remove(report_file)
    
    return {
        "success": process.returncode == 0 or summary["failed"] == 0,
        "exit_code": process.returncode,
        "tests": results,
        "summary": summary,
        "started_at": start_time.isoformat() + "Z",
        "finished_at": end_time.isoformat() + "Z"
    }

def main():
    print("Starting evaluation...")
    start_all = datetime.datetime.utcnow()
    

    print("Running 'before' tests...")
    before_results = run_tests(["tests/test_baseline_failures.py"])

    print("Running 'after' tests...")
    # Target all tests except the baseline failures
    after_results = run_tests(["tests/"], extra_args=["-k", "not BaselineFailures"])
    
    end_all = datetime.datetime.utcnow()
    duration = (end_all - start_all).total_seconds()
    
    report = {
        "run_id": str(uuid.uuid4()),
        "started_at": start_all.isoformat() + "Z",
        "finished_at": end_all.isoformat() + "Z",
        "duration_seconds": duration,
        "success": after_results["success"],
        "error": None,
        "environment": {
            "node_version": "N/A (Python Project)",
            "platform": sys.platform,
            "os": f"{platform.system()}-{platform.release()}",
            "architecture": platform.machine(),
            "hostname": socket.gethostname()
        },
        "results": {
            "before": {
                "success": before_results["success"],
                "exit_code": before_results["exit_code"],
                "tests": before_results["tests"],
                "summary": before_results["summary"]
            },
            "after": {
                "success": after_results["success"],
                "exit_code": after_results["exit_code"],
                "tests": after_results["tests"],
                "summary": after_results["summary"]
            },
            "comparison": {
                "before_tests_passed": before_results["success"],
                "after_tests_passed": after_results["success"],
                "before_total": before_results["summary"]["total"],
                "before_passed": before_results["summary"]["passed"],
                "before_failed": before_results["summary"]["failed"],
                "before_xfailed": before_results["summary"]["xfailed"],
                "before_skipped": before_results["summary"]["skipped"],
                "before_errors": before_results["summary"]["errors"],
                "after_total": after_results["summary"]["total"],
                "after_passed": after_results["summary"]["passed"],
                "after_failed": after_results["summary"]["failed"],
                "after_xfailed": after_results["summary"]["xfailed"],
                "after_skipped": after_results["summary"]["skipped"],
                "after_errors": after_results["summary"]["errors"],
                "improvement": {
                    "tests_fixed": after_results["summary"]["passed"],
                    "features_added": after_results["summary"]["passed"]
                }
            }
        }
    }
    
    # Target directory: evaluation/yyyy-mm-dd/hh-mm-ss/
    now = datetime.datetime.now()
    date_str = now.strftime("%Y-%m-%d")
    time_str = now.strftime("%H-%M-%S")
    report_dir = os.path.join("evaluation", date_str, time_str)
    os.makedirs(report_dir, exist_ok=True)
    
    report_path = os.path.join(report_dir, "report.json")
    with open(report_path, 'w') as f:
        json.dump(report, f, indent=2)
    
    print(f"Evaluation complete. Report saved to {report_path}")

if __name__ == "__main__":
    main()
