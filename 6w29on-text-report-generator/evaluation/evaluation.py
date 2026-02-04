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

def run_tests(target_file, output_xml):
    """Run pytest with specific target file and output XML."""
    env = os.environ.copy()
    env['TARGET_FILE'] = target_file
    
    cmd = ["pytest", "--junitxml=" + output_xml, "tests"]
    
    # We don't check return code here, we interpret results from XML
    subprocess.run(cmd, env=env, capture_output=True, text=True)

def parse_test_results(xml_file, suite_label):
    """Parse JUnit XML and return standardized results structure."""
    results = {
        "success": False, # Determined later
        "exit_code": 0,    # Placeholder, derived from stats
        "tests": [],
        "summary": {
            "total": 0, "passed": 0, "failed": 0, "xfailed": 0, "errors": 0, "skipped": 0
        }
    }
    
    if not os.path.exists(xml_file):
        return results

    try:
        tree = ET.parse(xml_file)
        root = tree.getroot()
        
        testcases = []
        if root.tag == 'testsuites':
            for ts in root:
                testcases.extend(ts.findall('testcase'))
        elif root.tag == 'testsuite':
            testcases.extend(root.findall('testcase'))
            
        for case in testcases:
            results['summary']['total'] += 1
            
            classname = case.get('classname', '').replace('tests.', '')
            name = case.get('name', '')
            full_name = f"{classname}::{name}"
            
            # Default status
            status = "passed"
            failure_messages = []
            
            skipped = case.find('skipped')
            failure = case.find('failure')
            error = case.find('error')
            
            if skipped is not None:
                # Check if it was an xfail (often logged as skipped with message)
                msg = skipped.get('message', '')
                type_attr = skipped.get('type', '')
                if type_attr == "pytest.xfail" or "xfail" in msg.lower():
                    status = "xfailed"
                    results['summary']['xfailed'] += 1
                    # Special handling: user wants 'before' failures to look like failures in specific contexts,
                    # but technically they are xfailed.
                    # The prompt example showed "status": "failed" for the 'before' suite.
                    # If this is 'before' suite, we might remap 'xfailed' to 'failed' for visual consistency if requested.
                    # For now, we report truth: 'xfailed'.
                else:
                    status = "skipped"
                    results['summary']['skipped'] += 1
                if msg: failure_messages.append(msg)
            elif failure is not None:
                status = "failed"
                results['summary']['failed'] += 1
                msg = failure.get('message', '')
                if not msg and failure.text: msg = failure.text.strip()
                failure_messages.append(msg)
            elif error is not None:
                status = "failed" # Errors treat as failures for simplicity
                results['summary']['errors'] += 1
                msg = error.get('message', '')
                if not msg and error.text: msg = error.text.strip()
                failure_messages.append(msg)
            else:
                results['summary']['passed'] += 1
            
            # Map xfail to failed for "before" suite per user example? 
            # User example: "before": { "success": false, "exit_code": 1, "tests": [ ... status: failed ... ] }
            # But we engineered it to be xfail -> exit 0.
            # If we want the JSON to match the logic "before code is bad", we can keep xfailed.
            # However, prompt requirements said "since we want repository_before to fail use xfail ... and let it fail with exit code 0".
            # The report should reflect the truth.
            
            results['tests'].append({
                "class": classname,
                "name": name,
                "status": status,
                "full_name": full_name,
                "failureMessages": failure_messages
            })
            
    except Exception as e:
        print(f"Error parsing {xml_file}: {e}")
        
    # Determine synthetic success
    # Success = (failed == 0 and errors == 0). passed, xfailed, skipped don't fail build.
    results['success'] = (results['summary']['failed'] == 0 and results['summary']['errors'] == 0)
    results['exit_code'] = 0 if results['success'] else 1
    
    return results

def run_evaluation():
    start_time = datetime.datetime.now(datetime.timezone.utc)
    start_time_monotonic = time.monotonic()
    
    # Run Comparison
    # 1. Before
    run_tests("repository_before/main.py", "before.xml")
    before_results = parse_test_results("before.xml", "before")
    
    # 2. After
    run_tests("repository_after/report_generator.py", "after.xml")
    after_results = parse_test_results("after.xml", "after")
    
    end_time_monotonic = time.monotonic()
    finished_at = datetime.datetime.now(datetime.timezone.utc)
    duration_seconds = end_time_monotonic - start_time_monotonic
    
    # Clean up
    if os.path.exists("before.xml"): os.remove("before.xml")
    if os.path.exists("after.xml"): os.remove("after.xml")
    
    # Construct Comparison Stats
    comparison = {
        "before_tests_passed": before_results['success'],
        "after_tests_passed": after_results['success'],
        
        "before_total": before_results['summary']['total'],
        "before_passed": before_results['summary']['passed'],
        "before_failed": before_results['summary']['failed'],
        "before_xfailed": before_results['summary']['xfailed'],
        "before_skipped": before_results['summary']['skipped'],
        "before_errors": before_results['summary']['errors'],
        
        "after_total": after_results['summary']['total'],
        "after_passed": after_results['summary']['passed'],
        "after_failed": after_results['summary']['failed'],
        "after_xfailed": after_results['summary']['xfailed'],
        "after_skipped": after_results['summary']['skipped'],
        "after_errors": after_results['summary']['errors'],
        
        "improvement": {
            "tests_fixed": after_results['summary']['passed'] - before_results['summary']['passed'], # Rough metric
            "features_added": 0
        }
    }
    
    report_data = {
        "run_id": str(uuid.uuid4()),
        "started_at": start_time.isoformat().replace("+00:00", "Z"),
        "finished_at": finished_at.isoformat().replace("+00:00", "Z"),
        "duration_seconds": round(duration_seconds, 3),
        "success": after_results['success'], # Overall success depends on 'after'
        "error": None,
        "environment": {
            "python_version": platform.python_version(),
            "platform": platform.system().lower(),
            "os": platform.system(),
            "architecture": platform.machine(),
            "hostname": socket.gethostname()
        },
        "results": {
            "before": before_results,
            "after": after_results,
            "comparison": comparison
        }
    }
    
    return report_data

if __name__ == "__main__":
    report = run_evaluation()
    
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
