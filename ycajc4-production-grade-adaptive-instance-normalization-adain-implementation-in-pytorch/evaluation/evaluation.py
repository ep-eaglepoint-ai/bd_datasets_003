#!/usr/bin/env python3

import json
import os
import subprocess
import sys
import time
import uuid
from datetime import datetime
from pathlib import Path


def run_tests():
    """Run pytest and capture results"""
    try:
        # Run pytest with JSON output
        result = subprocess.run(
            [
                sys.executable, "-m", "pytest", 
                "tests/", 
                "--json-report", 
                "--json-report-file=/tmp/test_results.json",
                "-v"
            ],
            capture_output=True,
            text=True,
            cwd="/app"
        )
        
        # Load JSON results if available
        test_results = {}
        if os.path.exists("/tmp/test_results.json"):
            with open("/tmp/test_results.json", "r") as f:
                test_results = json.load(f)
        
        return result, test_results
        
    except Exception as e:
        print(f"Error running tests: {e}")
        return None, {}


def extract_test_summary(test_results):
    """Extract test summary from pytest JSON output"""
    if not test_results:
        return {
            "total": 0,
            "passed": 0,
            "failed": 0,
            "xfailed": 0,
            "errors": 0,
            "skipped": 0
        }
    
    summary = test_results.get("summary", {})
    return {
        "total": summary.get("total", 0),
        "passed": summary.get("passed", 0),
        "failed": summary.get("failed", 0),
        "xfailed": summary.get("xfailed", 0),
        "errors": summary.get("error", 0),
        "skipped": summary.get("skipped", 0)
    }


def extract_test_details(test_results):
    """Extract individual test details"""
    if not test_results:
        return []
    
    tests = []
    for test in test_results.get("tests", []):
        tests.append({
            "name": test.get("nodeid", "Unknown test"),
            "status": test.get("outcome", "unknown"),
            "duration": int(test.get("duration", 0) * 1000),  # Convert to ms
            "failureMessages": test.get("call", {}).get("longrepr", "").split("\n") if test.get("outcome") == "failed" else []
        })
    
    return tests


def get_environment_info():
    """Get environment information"""
    import platform
    import socket
    
    return {
        "python_version": platform.python_version(),
        "platform": platform.system().lower(),
        "os": platform.system(),
        "architecture": platform.machine(),
        "hostname": socket.gethostname(),
        "torch_version": None,
        "pytest_version": None
    }


def get_package_versions():
    """Get package versions"""
    try:
        import torch
        import pytest
        return {
            "torch_version": torch.__version__,
            "pytest_version": pytest.__version__
        }
    except ImportError:
        return {}


def create_evaluation_report():
    """Create comprehensive evaluation report"""
    start_time = time.time()
    started_at = datetime.utcnow().isoformat() + "Z"
    
    # Generate unique run ID
    run_id = str(uuid.uuid4())
    
    # Get environment info
    env_info = get_environment_info()
    package_info = get_package_versions()
    env_info.update(package_info)
    
    print(f"Starting evaluation run {run_id}")
    print(f"Python: {env_info.get('python_version')}")
    print(f"Torch: {env_info.get('torch_version')}")
    print(f"Pytest: {env_info.get('pytest_version')}")
    
    # Run tests
    test_result, test_results = run_tests()
    
    end_time = time.time()
    finished_at = datetime.utcnow().isoformat() + "Z"
    duration = end_time - start_time
    
    # Determine success
    success = test_result.returncode == 0 if test_result else False
    error = None if success else (test_result.stderr if test_result else "Unknown error")
    
    # Extract test information
    test_summary = extract_test_summary(test_results)
    test_details = extract_test_details(test_results)
    
    # Create report structure
    report = {
        "run_id": run_id,
        "started_at": started_at,
        "finished_at": finished_at,
        "duration_seconds": round(duration, 3),
        "success": success,
        "error": error,
        "environment": env_info,
        "project": {
            "name": "Adaptive Instance Normalization (AdaIN)",
            "description": "Production-grade AdaIN implementation in PyTorch",
            "features": [
                "Strict input validation",
                "Arbitrary spatial dimensions", 
                "Style batch broadcasting",
                "Optional mask support",
                "Numerical stability protection",
                "Mixed precision safety (fp16/bf16)",
                "Alpha interpolation",
                "Gradient detachment",
                "nn.Module wrapper"
            ]
        },
        "results": {
            "after": {
                "success": success,
                "exit_code": test_result.returncode if test_result else 1,
                "tests": test_details,
                "summary": test_summary
            },
            "comparison": {
                "after_tests_passed": success,
                "after_total": test_summary["total"],
                "after_passed": test_summary["passed"],
                "after_failed": test_summary["failed"],
                "after_xfailed": test_summary["xfailed"]
            }
        }
    }
    
    return report


def save_report(report):
    """Save report to timestamped directory"""
    # Create evaluation directory structure
    eval_dir = Path("/app/evaluation")
    eval_dir.mkdir(exist_ok=True)
    
    # Create timestamped directory
    now = datetime.now()
    timestamp_dir = eval_dir / now.strftime("%Y-%m-%d") / now.strftime("%H-%M-%S")
    timestamp_dir.mkdir(parents=True, exist_ok=True)
    
    # Save report
    report_path = timestamp_dir / "report.json"
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)
    
    print(f"Report saved to: {report_path}")
    print(f"Tests passed: {report['results']['comparison']['after_passed']}/{report['results']['comparison']['after_total']}")
    print(f"Duration: {report['duration_seconds']}s")
    print(f"Success: {report['success']}")
    
    return report_path


def main():
    """Main evaluation function"""
    print("=== AdaIN Evaluation ===")
    
    try:
        # Create evaluation report
        report = create_evaluation_report()
        
        # Save report
        report_path = save_report(report)
        
        # Exit with appropriate code
        sys.exit(0 if report['success'] else 1)
        
    except Exception as e:
        print(f"Evaluation failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()