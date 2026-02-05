#!/usr/bin/env python3
"""
Evaluation runner

This evaluation script:
- Runs pytest tests on the tests/ folder for after implementation
- Collects individual test results with pass/fail status
- Generates structured reports with environment metadata

Run with:
    python evaluation/evaluation.py [options]
"""
import os
import sys
import json
import uuid
import platform
import subprocess
from datetime import datetime
from pathlib import Path


def generate_run_id():
    """Generate a unique run ID."""
    return str(uuid.uuid4())



def get_environment_info():
    return {
        "python_version": platform.python_version(),
        "platform": platform.platform(),
    }


def run_pytest_with_pythonpath(pythonpath, tests_dir, label):
    """
    Run pytest on the tests/ folder with specific PYTHONPATH.
    
    Args:
        pythonpath: The PYTHONPATH to use for the tests
        tests_dir: Path to the tests directory
        label: Label for this test run (e.g., "before", "after")
    
    Returns:
        dict with test results
    """
    print(f"\n{'=' * 100}")
    print(f"RUNNING TESTS FOR: {label.upper()}")
    print(f"{'=' * 100}")
    print(f"PYTHONPATH: {pythonpath}")
    print(f"Tests directory: {tests_dir}")
    
    # Build pytest command
    cmd = [
        sys.executable, "-m", "pytest",
        str(tests_dir),
        "-v",
        "--tb=short",
    ]
    
    env = os.environ.copy()
    # Prepend pythonpath to existing PYTHONPATH
    current_pythonpath = env.get("PYTHONPATH", "")
    if current_pythonpath:
        env["PYTHONPATH"] = f"{pythonpath}{os.pathsep}{current_pythonpath}"
    else:
        env["PYTHONPATH"] = pythonpath
    
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            cwd=str(Path(tests_dir).parent),
            env=env,
            timeout=120
        )
        
        stdout = result.stdout
        stderr = result.stderr
        
        # Combine stdout and stderr for output
        combined_output = stdout
        if stderr:
            combined_output += stderr
        
        # Parse verbose output to get test results
        tests = parse_pytest_verbose_output(stdout)
        
        # Count results
        passed = sum(1 for t in tests if t.get("outcome") == "passed")
        failed = sum(1 for t in tests if t.get("outcome") == "failed")
        errors = sum(1 for t in tests if t.get("outcome") == "error")
        skipped = sum(1 for t in tests if t.get("outcome") == "skipped")
        total = len(tests)
        
        print(f"\nResults: {passed} passed, {failed} failed, {errors} errors, {skipped} skipped (total: {total})")
        
        # Print individual test results
        for test in tests:
            status_icon = {
                "passed": "✅",
                "failed": "❌",
                "error": "💥",
                "skipped": "⏭️"
            }.get(test.get("outcome"), "❓")
            print(f"  {status_icon} {test.get('nodeid', 'unknown')}: {test.get('outcome', 'unknown')}")
        
        # Return format matching the sample
        return {
            "passed": result.returncode == 0,
            "return_code": result.returncode,
            "output": combined_output,
        }
        
    except subprocess.TimeoutExpired:
        print("❌ Test execution timed out")
        return {
            "passed": False,
            "return_code": -1,
            "output": "Test execution timed out",
        }
    except Exception as e:
        print(f"❌ Error running tests: {e}")
        return {
            "passed": False,
            "return_code": -1,
            "output": f"Error running tests: {str(e)}",
        }


def parse_pytest_verbose_output(output):
    """Parse pytest verbose output to extract test results."""
    tests = []
    lines = output.split('\n')
    
    for line in lines:
        line_stripped = line.strip()
        
        if '::' in line_stripped:
            outcome = None
            if ' PASSED' in line_stripped:
                outcome = "passed"
            elif ' FAILED' in line_stripped:
                outcome = "failed"
            elif ' ERROR' in line_stripped:
                outcome = "error"
            elif ' SKIPPED' in line_stripped:
                outcome = "skipped"
            
            if outcome:
                # Extract nodeid (everything before the status)
                for status_word in [' PASSED', ' FAILED', ' ERROR', ' SKIPPED']:
                    if status_word in line_stripped:
                        nodeid = line_stripped.split(status_word)[0].strip()
                        break
                
                tests.append({
                    "nodeid": nodeid,
                    "name": nodeid.split("::")[-1] if "::" in nodeid else nodeid,
                    "outcome": outcome,
                })
    
    return tests


def run_evaluation():
    """  
    Returns dict with test results from after implementation.
    """
    project_root = Path(__file__).parent.parent
    tests_dir = project_root / "tests"
    
    # PYTHONPATH for after implementation  
    after_pythonpath = str(project_root / "repository_after")
    
    # Run tests with AFTER implementation
    after_results = run_pytest_with_pythonpath(
        after_pythonpath,
        tests_dir,
        "after (repository_after)"
    )
    
    # Print summary
    print(f"\n{'=' * 100}")
    print("EVALUATION SUMMARY")
    print(f"{'=' * 100}")
    
    print(f"\nAfter Implementation (repository_after):")
    print(f"  Overall: {'✅ PASSED' if after_results.get('passed') else '❌ FAILED'}")
    
    # Determine expected behavior
    after_passed = after_results.get("passed")
    
    if after_passed:
        print("✅ After implementation: All tests passed (expected)")
    else:
        print("❌ After implementation: Some tests failed (unexpected - should pass all)")
    
    # Generate summary
    if after_passed:
        improvement_summary = "Repository after passes all correctness tests."
    else:
        improvement_summary = "Repository after failed some tests."
        
    passed_gate = after_passed
    
    return {
        "after": after_results,
        "passed_gate": passed_gate,
        "improvement_summary": improvement_summary,
    }


def generate_output_path():
    """Generate output path in format: evaluation/YYYY-MM-DD/HH-MM-SS/report.json"""
    now = datetime.now()
    date_str = now.strftime("%Y-%m-%d")
    time_str = now.strftime("%H-%M-%S")
    
    project_root = Path(__file__).parent.parent
    output_dir = project_root / "evaluation" / date_str / time_str
    output_dir.mkdir(parents=True, exist_ok=True)
    
    return output_dir / "report.json"


def main():
    """Main entry point for evaluation."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Run evaluation")
    parser.add_argument(
        "--output", 
        type=str, 
        default=None, 
        help="Output JSON file path (default: evaluation/YYYY-MM-DD/HH-MM-SS/report.json)"
    )
    
    args = parser.parse_args()
    
    # Generate run ID and timestamps (UTC)
    run_id = generate_run_id()
    started_at = datetime.utcnow()
    
    print(f"Run ID: {run_id}")
    print(f"Started at: {started_at.isoformat()}Z")
    
    try:
        results = run_evaluation()
        
        # Success if after implementation passes all tests
        success = results["after"].get("passed", False)
        error_message = None
        
        # Extract after results
        after_tests = results["after"]
        passed_gate = results["passed_gate"]
        improvement_summary = results["improvement_summary"]
        
    except Exception as e:
        import traceback
        print(f"\nERROR: {str(e)}")
        traceback.print_exc()
        
        # Create default error results
        after_tests = {
            "passed": False,
            "return_code": -1,
            "output": f"Error during evaluation: {str(e)}"
        }
        passed_gate = False
        improvement_summary = f"Evaluation failed with error: {str(e)}"
        success = False
        error_message = str(e)
    
    finished_at = datetime.utcnow()
    duration = (finished_at - started_at).total_seconds()
    
    # Collect environment information
    environment = get_environment_info()
    
    # Build report
    report = {
        "run_id": run_id,
        "started_at": started_at.isoformat() + "Z",
        "finished_at": finished_at.isoformat() + "Z",
        "duration_seconds": round(duration, 6),
        "environment": environment,
        "after": {
            "tests": after_tests,
            "metrics": {}
        },
        "comparison": {
            "passed_gate": passed_gate,
            "improvement_summary": improvement_summary
        },
        "success": success,
        "error": error_message
    }
    
    # Determine output path
    if args.output:
        output_path = Path(args.output)
    else:
        output_path = generate_output_path()
    
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_path, "w") as f:
        json.dump(report, f, indent=2)
    print(f"\n✅ Report saved to: {output_path}")
    
    print(f"\n{'=' * 100}")
    print(f"EVALUATION COMPLETE")
    print(f"{'=' * 100}")
    print(f"Run ID: {run_id}")
    print(f"Duration: {duration:.2f}s")
    print(f"Success: {'✅ YES' if success else '❌ NO'}")
    
    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
