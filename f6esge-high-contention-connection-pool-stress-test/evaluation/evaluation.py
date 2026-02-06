import os
import json
import subprocess
import sys
import time
import uuid
import platform
import csv
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, Optional

ROOT = Path(__file__).parent.parent.resolve()
REPORTS = ROOT / "evaluation" / "reports"
REPO_PATH = ROOT / "repository_after"

def environment_info() -> Dict[str, str]:
    return {
        "python_version": platform.python_version(),
        "platform": f"{platform.system()} {platform.release()}",
        "java_version": get_java_version()
    }

def get_java_version() -> str:
    try:
        result = subprocess.run(
            ["java", "-version"],
            capture_output=True,
            text=True,
            timeout=5
        )
        return result.stderr.split('\n')[0].strip()
    except Exception:
        return "unknown"

def parse_surefire_reports(report_dir: Path) -> Dict[str, int]:
    stats = {"tests_run": 0, "failures": 0, "errors": 0, "skipped": 0}
    if not report_dir.exists():
        return stats
    try:
        import xml.etree.ElementTree as ET
        for xml_file in report_dir.glob("TEST-*.xml"):
            try:
                tree = ET.parse(xml_file)
                root = tree.getroot()
                stats["tests_run"] += int(root.attrib.get("tests", 0))
                stats["failures"] += int(root.attrib.get("failures", 0))
                stats["errors"] += int(root.attrib.get("errors", 0))
                stats["skipped"] += int(root.attrib.get("skipped", 0))
            except Exception:
                pass
    except Exception:
        pass
    return stats

def parse_jacoco_coverage(report_file: Path) -> Dict[str, float]:
    stats = {
        "instruction_coverage": 0.0,
        "branch_coverage": 0.0,
        "line_coverage": 0.0,
        "complexity_coverage": 0.0,
        "method_coverage": 0.0,
        "class_coverage": 0.0
    }
    if not report_file.exists():
        return stats
        
    try:
        total_inst = 0; missed_inst = 0
        total_branch = 0; missed_branch = 0
        total_line = 0; missed_line = 0
        
        with open(report_file, 'r') as f:
            reader = csv.DictReader(f)
            for row in reader:
                missed_inst += int(row['INSTRUCTION_MISSED'])
                total_inst += int(row['INSTRUCTION_MISSED']) + int(row['INSTRUCTION_COVERED'])
                
                missed_branch += int(row['BRANCH_MISSED'])
                total_branch += int(row['BRANCH_MISSED']) + int(row['BRANCH_COVERED'])
                
                missed_line += int(row['LINE_MISSED'])
                total_line += int(row['LINE_MISSED']) + int(row['LINE_COVERED'])

        if total_inst > 0: stats["instruction_coverage"] = (total_inst - missed_inst) / total_inst * 100.0
        if total_branch > 0: stats["branch_coverage"] = (total_branch - missed_branch) / total_branch * 100.0
        if total_line > 0: stats["line_coverage"] = (total_line - missed_line) / total_line * 100.0
        
    except Exception as e:
        print(f"Error parsing coverage: {e}")
        
    return stats

def run_tests() -> Dict[str, Any]:
    print("Running Maven Tests...")
    cmd = ["mvn", "-Dmaven.test.failure.ignore=true", "clean", "test", "jacoco:report"]
    result = subprocess.run(cmd, cwd=REPO_PATH, capture_output=True, text=True)
    
    stats = parse_surefire_reports(REPO_PATH / "target" / "surefire-reports")
    coverage = parse_jacoco_coverage(REPO_PATH / "target" / "site" / "jacoco" / "jacoco.csv")
    
    return {
        "passed": result.returncode == 0 or (stats["failures"] == 0 and stats["errors"] == 0 and stats["tests_run"] > 0),
        "return_code": result.returncode,
        "stats": stats,
        "coverage": coverage,
        "output_snippet": result.stdout[-500:]
    }

def run_meta_test() -> Dict[str, Any]:
    print("Running Meta-Tests...")
    cmd = ["python3", str(ROOT / "tests" / "meta_test.py")]
    result = subprocess.run(cmd, capture_output=True, text=True)
    return {
        "passed": result.returncode == 0,
        "output": result.stdout + result.stderr
    }

def main():
    run_id = str(uuid.uuid4())
    start_time = time.time()
    
    test_results = run_tests()
    meta_test_results = run_meta_test()
    
    duration = time.time() - start_time
    
    # Validation Logic
    success = (
        test_results["passed"] and 
        meta_test_results["passed"] and 
        test_results["coverage"]["instruction_coverage"] >= 99.0 # Expect high coverage
    )
    
    report = {
        "run_id": run_id,
        "duration_seconds": duration,
        "environment": environment_info(),
        "tests": test_results,
        "meta_tests": meta_test_results,
        "success": success
    }
    
    # Save Report
    REPORTS.mkdir(parents=True, exist_ok=True)
    with open(REPORTS / "report.json", "w") as f:
        json.dump(report, f, indent=2)
        
    # Print Summary
    print("\n" + "="*40)
    print("EVALUATION SUMMARY")
    print("="*40)
    print(f"Run ID: {run_id}")
    print(f"Tests Passed: {test_results['passed']}")
    print(f"Test Stats: {test_results['stats']}")
    print(f"Coverage: {test_results['coverage']['instruction_coverage']:.2f}% (Instructions)")
    print(f"Meta-Tests Passed: {meta_test_results['passed']}")
    print(f"SUCCESS: {success}")
    print("="*40)
    
    if not success:
        if not test_results["passed"]: print("FAILURE: Tests failed.")
        if not meta_test_results["passed"]: print("FAILURE: Meta-Tests failed.")
        if test_results["coverage"]["instruction_coverage"] < 99.0: print("FAILURE: Coverage too low.")
        sys.exit(1)
    
    sys.exit(0)

if __name__ == "__main__":
    main()
