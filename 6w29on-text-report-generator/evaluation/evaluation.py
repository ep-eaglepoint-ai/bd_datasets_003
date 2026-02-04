import os
import json
import subprocess
import time
import uuid
import platform
import socket
import datetime
import xml.etree.ElementTree as ET
import sys

def run_tests_and_generate_report():
    start_time = datetime.datetime.now(datetime.timezone.utc)
    start_time_monotonic = time.monotonic()
    
    # Run pytest and generate JUnit XML for robust parsing
    # Use -q for quiet output in console, but depend on xml for data
    cmd = ["pytest", "--junitxml=report.xml", "tests"]
    
    print(f"Running command: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    end_time_monotonic = time.monotonic()
    finished_at = datetime.datetime.now(datetime.timezone.utc)
    duration_seconds = end_time_monotonic - start_time_monotonic
    
    test_results = []
    summary = {
        "total": 0,
        "passed": 0,
        "failed": 0,
        "xfailed": 0,
        "errors": 0,
        "skipped": 0
    }
    
    # Helper to process test suite XML
    def process_testsuite(ts):
        nonlocal summary
        for case in ts.findall('testcase'):
            summary['total'] += 1
            
            # Construct name nicely
            classname = case.get('classname', '')
            name = case.get('name', '')
            # Clean up classname to relieve path clutter if present
            classname = classname.replace('tests.', '')
            full_name = f"{classname}::{name}"
            
            duration_s = float(case.get('time', 0))
            duration_ms = int(duration_s * 1000)
            
            status = "passed"
            failure_messages = []
            
            skipped = case.find('skipped')
            failure = case.find('failure')
            error = case.find('error')
            
            if skipped is not None:
                status = "skipped" # Could be xfail depending on message, but simple skipped is safe
                summary['skipped'] += 1
                msg = skipped.get('message', '')
                if msg:
                    failure_messages.append(msg)
            elif failure is not None:
                status = "failed"
                summary['failed'] += 1
                msg = failure.get('message', '')
                if not msg and failure.text:
                    msg = failure.text.strip()
                failure_messages.append(msg)
            elif error is not None:
                status = "error"
                summary['errors'] += 1
                msg = error.get('message', '')
                if not msg and error.text:
                    msg = error.text.strip()
                failure_messages.append(msg)
            else:
                summary['passed'] += 1
                
            test_results.append({
                "name": full_name,
                "status": status,
                "duration": duration_ms,
                "failureMessages": failure_messages
            })

    # Parse XML
    try:
        if os.path.exists("report.xml"):
            tree = ET.parse("report.xml")
            root = tree.getroot()
            if root.tag == 'testsuites':
                for ts in root:
                    process_testsuite(ts)
            elif root.tag == 'testsuite':
                process_testsuite(root)
        else:
            print("Warning: report.xml was not generated.")
            summary['errors'] = 1 # Treat as error
    except Exception as e:
        print(f"Error parsing XML report: {e}")
        summary['errors'] += 1

    # Cleanup XML
    if os.path.exists("report.xml"):
        os.remove("report.xml")

    # Construct Report Dictionary
    report_data = {
        "run_id": str(uuid.uuid4()),
        "started_at": start_time.isoformat().replace("+00:00", "Z"),
        "finished_at": finished_at.isoformat().replace("+00:00", "Z"),
        "duration_seconds": round(duration_seconds, 3),
        "success": result.returncode == 0,
        "error": None if result.returncode == 0 else "Test execution failed",
        "environment": {
            "python_version": platform.python_version(),
            "platform": platform.system().lower(),
            "os": platform.system(),
            "architecture": platform.machine(),
            "hostname": socket.gethostname()
        },
        "results": {
            "after": {
                "success": result.returncode == 0,
                "exit_code": result.returncode,
                "tests": test_results,
                "summary": summary
            },
            "comparison": {
                "after_tests_passed": result.returncode == 0,
                "after_total": summary["total"],
                "after_passed": summary["passed"],
                "after_failed": summary["failed"],
                "after_xfailed": summary["xfailed"]
            }
        }
    }
    
    return report_data

if __name__ == "__main__":
    report = run_tests_and_generate_report()
    
    # Save to evaluation/yyyy-mm-dd/hh-mm-ss/report.json
    now = datetime.datetime.now()
    output_dir = os.path.join(
        "evaluation",
        now.strftime("%Y-%m-%d"),
        now.strftime("%H-%M-%S")
    )
    os.makedirs(output_dir, exist_ok=True)
    
    output_path = os.path.join(output_dir, "report.json")
    with open(output_path, "w") as f:
        json.dump(report, f, indent=2)
        
    print(f"Report generated: {output_path}")
