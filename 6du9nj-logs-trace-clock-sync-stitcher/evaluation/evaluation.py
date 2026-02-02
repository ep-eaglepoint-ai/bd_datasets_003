"""
Evaluation script for TraceStitcher.
Runs pytest and generates a report.
"""

import subprocess
import json
import sys
from pathlib import Path
from datetime import datetime


def run_tests():
    """Run pytest with coverage and return results."""
    result = {
        "passed": False,
        "total_tests": 0,
        "passed_tests": 0,
        "failed_tests": 0,
        "coverage_percent": 0,
        "output": ""
    }
    
    try:
        # Run pytest with coverage
        cmd = [
            "pytest",
            "-v",
            "--cov=repository_after",
            "--cov-report=term-missing",
            "tests/"
        ]
        
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=60
        )
        
        output = proc.stdout + proc.stderr
        result["output"] = output
        
        # Parse output
        if "passed" in output:
            # Extract test counts
            for line in output.split('\n'):
                if " passed" in line:
                    parts = line.split()
                    for i, part in enumerate(parts):
                        if part == "passed":
                            try:
                                result["passed_tests"] = int(parts[i-1])
                            except (ValueError, IndexError):
                                pass
                        elif part == "failed":
                            try:
                                result["failed_tests"] = int(parts[i-1])
                            except (ValueError, IndexError):
                                pass
                
                # Extract coverage
                if "TOTAL" in line and "%" in line:
                    parts = line.split()
                    for part in parts:
                        if "%" in part:
                            try:
                                result["coverage_percent"] = int(part.replace("%", ""))
                            except ValueError:
                                pass
        
        result["total_tests"] = result["passed_tests"] + result["failed_tests"]
        result["passed"] = proc.returncode == 0 and result["failed_tests"] == 0
        
    except Exception as e:
        result["output"] = f"Error running tests: {str(e)}"
    
    return result


def main():
    """Main evaluation entry point."""
    print("=" * 60)
    print("TraceStitcher Evaluation")
    print("=" * 60)
    print()
    
    print("Running tests...")
    results = run_tests()
    
    print()
    print("=" * 60)
    print("RESULTS")
    print("=" * 60)
    print(f"Total tests:    {results['total_tests']}")
    print(f"Passed:         {results['passed_tests']}")
    print(f"Failed:         {results['failed_tests']}")
    print(f"Coverage:       {results['coverage_percent']}%")
    print()
    
    if results["passed"]:
        print("✓ ALL TESTS PASSED")
        print("=" * 60)
        
        # Save report
        report_dir = Path("/app/evaluation/reports")
        report_dir.mkdir(parents=True, exist_ok=True)
        
        report_file = report_dir / f"report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(report_file, 'w') as f:
            json.dump(results, f, indent=2)
        
        print(f"Report saved to: {report_file}")
        sys.exit(0)
    else:
        print("✗ TESTS FAILED")
        print("=" * 60)
        print()
        print("Test output:")
        print(results["output"])
        sys.exit(1)


if __name__ == "__main__":
    main()
