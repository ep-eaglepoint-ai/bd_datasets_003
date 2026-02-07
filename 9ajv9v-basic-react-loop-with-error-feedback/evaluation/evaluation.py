#!/usr/bin/env python3
"""Evaluation runner.

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
    """Run pytest on the tests/ folder with specific PYTHONPATH.
    
    Args:
        pythonpath: The PYTHONPATH to use for the tests
        tests_dir: Path to the tests directory
        label: Label for this test run (e.g., "before", "after")
    
    Returns:
        dict with test results and metrics
    """
    print(f"\n{'=' * 100}")
    print(f"RUNNING TESTS FOR: {label.upper()}")
    print(f"{'=' * 100}")
    print(f"PYTHONPATH: {pythonpath}")
    print(f"Tests directory: {tests_dir}")
    
    # Build pytest command with duration reporting
    cmd = [
        sys.executable, "-m", "pytest",
        str(tests_dir),
        "-v",
        "--tb=short",
        "--durations=0",  # Show all test durations
    ]
    
    env = os.environ.copy()
    # Prepend pythonpath to existing PYTHONPATH
    current_pythonpath = env.get("PYTHONPATH", "")
    if current_pythonpath:
        env["PYTHONPATH"] = f"{pythonpath}{os.pathsep}{current_pythonpath}"
    else:
        env["PYTHONPATH"] = pythonpath
    
    try:
        import time
        start_time = time.time()
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            cwd=str(Path(tests_dir).parent),
            env=env,
            timeout=120
        )
        
        end_time = time.time()
        execution_time_ms = (end_time - start_time) * 1000
        
        stdout = result.stdout
        stderr = result.stderr
        
        # Combine stdout and stderr for output
        combined_output = stdout
        if stderr:
            combined_output += stderr
        
        # Parse verbose output to get test results
        tests = parse_pytest_verbose_output(stdout)
        
        # Parse test durations
        test_durations = parse_pytest_durations(stdout)
        
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
        
        # Calculate metrics
        metrics = calculate_metrics(
            tests=tests,
            test_durations=test_durations,
            execution_time_ms=execution_time_ms,
            passed=passed,
            failed=failed,
            errors=errors
        )
        
        # Return format matching the sample
        return {
            "passed": result.returncode == 0,
            "return_code": result.returncode,
            "output": combined_output,
            "metrics": metrics
        }
        
    except subprocess.TimeoutExpired:
        print("❌ Test execution timed out")
        return {
            "passed": False,
            "return_code": -1,
            "output": "Test execution timed out",
            "metrics": {
                "avg_time_ms": 0,
                "p95_time_ms": 0,
                "failures": 0,
                "failure_rate": 0.0,
                "deadlocks": 0,
                "ops_per_second": 0,
                "rows_processed": 0,
                "warnings": 0
            }
        }
    except Exception as e:
        print(f"❌ Error running tests: {e}")
        return {
            "passed": False,
            "return_code": -1,
            "output": f"Error running tests: {str(e)}",
            "metrics": {
                "avg_time_ms": 0,
                "p95_time_ms": 0,
                "failures": 0,
                "failure_rate": 0.0,
                "deadlocks": 0,
                "ops_per_second": 0,
                "rows_processed": 0,
                "warnings": 0
            }
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


def parse_pytest_durations(output):
    """Parse pytest durations output to extract test execution times."""
    durations = []
    lines = output.split('\n')
    in_durations_section = False
    
    for line in lines:
        # Look for the durations section
        if 'slowest durations' in line.lower() or '(durations' in line.lower():
            in_durations_section = True
            continue
        
        if in_durations_section:
            # Stop at empty line or next section
            if not line.strip() or line.startswith('='):
                break
            
            # Parse duration lines like "0.01s call     tests/test_agent.py::test_tool_registration"
            parts = line.strip().split()
            if len(parts) >= 2 and parts[0].endswith('s'):
                try:
                    duration_str = parts[0].rstrip('s')
                    duration_seconds = float(duration_str)
                    duration_ms = duration_seconds * 1000
                    durations.append(duration_ms)
                except (ValueError, IndexError):
                    continue
    
    return durations


def calculate_metrics(tests, test_durations, execution_time_ms, passed, failed, errors):
    """Calculate performance metrics from test results."""
    total_tests = len(tests)
    total_failures = failed + errors
    
    # Calculate average and p95 from test durations if available
    if test_durations:
        avg_time_ms = sum(test_durations) / len(test_durations)
        sorted_durations = sorted(test_durations)
        p95_index = int(len(sorted_durations) * 0.95)
        p95_time_ms = sorted_durations[p95_index] if p95_index < len(sorted_durations) else sorted_durations[-1]
    else:
        # Fallback: estimate from total execution time
        avg_time_ms = execution_time_ms / total_tests if total_tests > 0 else 0
        p95_time_ms = avg_time_ms * 1.5  # Rough estimate
    
    # Calculate ops per second (tests per second)
    execution_time_seconds = execution_time_ms / 1000
    ops_per_second = total_tests / execution_time_seconds if execution_time_seconds > 0 else 0
    
    # Calculate failure rate
    failure_rate = total_failures / total_tests if total_tests > 0 else 0.0
    
    return {
        "avg_time_ms": round(avg_time_ms, 1),
        "p95_time_ms": round(p95_time_ms, 1),
        "failures": total_failures,
        "failure_rate": round(failure_rate, 2),
        "deadlocks": 0,  # Would need specific detection logic
        "ops_per_second": round(ops_per_second, 1),
        "rows_processed": total_tests,
        "warnings": 0  # Would need to parse pytest warnings
    }


def run_evaluation():
    """
    Returns dict with test results from before and after implementations.
    """
    project_root = Path(__file__).parent.parent
    tests_dir = project_root / "tests"
    
    # PYTHONPATH for before implementation (empty/baseline)
    before_pythonpath = str(project_root / "repository_before")
    
    # PYTHONPATH for after implementation  
    after_pythonpath = str(project_root / "repository_after")
    
    # Check if repository_before is empty (only has .gitkeep or is empty)
    before_dir = project_root / "repository_before"
    before_files = list(before_dir.glob("*"))
    is_before_empty = len(before_files) == 0 or (len(before_files) == 1 and before_files[0].name == ".gitkeep")
    
    # Run tests with BEFORE implementation
    if is_before_empty:
        print(f"\n{'=' * 100}")
        print(f"RUNNING TESTS FOR: BEFORE (REPOSITORY_BEFORE)")
        print(f"{'=' * 100}")
        print(f"Repository before is empty - skipping tests")
        before_results = {
            "passed": False,
            "return_code": -1,
            "output": "No tests run",
            "metrics": {
                "avg_time_ms": 0,
                "p95_time_ms": 0,
                "failures": 0,
                "failure_rate": 0.0,
                "deadlocks": 0,
                "ops_per_second": 0,
                "rows_processed": 0,
                "warnings": 0
            }
        }
    else:
        before_results = run_pytest_with_pythonpath(
            before_pythonpath,
            tests_dir,
            "before (repository_before)"
        )
    
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
    print(f"\nBefore Implementation (repository_before):")
    if is_before_empty:
        print(f"  Overall: ⏭️  SKIPPED (repository empty)")
    else:
        print(f"  Overall: {'✅ PASSED' if before_results.get('passed') else '❌ FAILED'}")
    
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
        "before": before_results,
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
    
    parser = argparse.ArgumentParser(description="Run rate limiter evaluation")
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
        
        # Extract before and after results
        before_tests = results["before"]
        after_tests = results["after"]
        passed_gate = results["passed_gate"]
        improvement_summary = results["improvement_summary"]
        
        # Extract metrics from results
        before_metrics = before_tests.pop("metrics", {})
        after_metrics = after_tests.pop("metrics", {})
        
    except Exception as e:
        import traceback
        print(f"\nERROR: {str(e)}")
        traceback.print_exc()
        
        # Create default error results
        before_tests = {
            "passed": False,
            "return_code": -1,
            "output": "Error during evaluation"
        }
        after_tests = {
            "passed": False,
            "return_code": -1,
            "output": f"Error during evaluation: {str(e)}"
        }
        before_metrics = {
            "avg_time_ms": 0,
            "p95_time_ms": 0,
            "failures": 0,
            "failure_rate": 0.0,
            "deadlocks": 0,
            "ops_per_second": 0,
            "rows_processed": 0,
            "warnings": 0
        }
        after_metrics = {
            "avg_time_ms": 0,
            "p95_time_ms": 0,
            "failures": 0,
            "failure_rate": 0.0,
            "deadlocks": 0,
            "ops_per_second": 0,
            "rows_processed": 0,
            "warnings": 0
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
        "before": {
            "tests": before_tests,
            "metrics": before_metrics
        },
        "after": {
            "tests": after_tests,
            "metrics": after_metrics
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
