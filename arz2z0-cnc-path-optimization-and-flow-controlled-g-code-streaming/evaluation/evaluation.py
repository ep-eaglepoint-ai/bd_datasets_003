#!/usr/bin/env python3
import os
import sys
import json
import uuid
import platform
import subprocess
from datetime import datetime
from pathlib import Path


def generate_run_id():
    """Generate a short unique run ID."""
    return uuid.uuid4().hex[:8]


def get_git_info():
    """Get git commit and branch information."""
    git_info = {"git_commit": "unknown", "git_branch": "unknown"}
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            git_info["git_commit"] = result.stdout.strip()[:8]
    except Exception:
        pass

    try:
        result = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            git_info["git_branch"] = result.stdout.strip()
    except Exception:
        pass

    return git_info


def get_environment_info():
    """Collect environment information for the report."""
    git_info = get_git_info()

    return {
        "python_version": platform.python_version(),
        "platform": platform.platform(),
        "os": platform.system(),
        "os_release": platform.release(),
        "architecture": platform.machine(),
        "hostname": platform.node(),
        "git_commit": git_info["git_commit"],
        "git_branch": git_info["git_branch"],
    }


def run_pytest_tests(tests_dir, label):
    """
    Run Pytest tests and parse the JSON output.
    """
    print(f"\n{'=' * 60}")
    print(f"RUNNING TESTS ({label.upper()})")
    print(f"{'=' * 60}")
    print(f"Environment: {label}")
    print(f"Tests directory: {tests_dir}")

    # Temporary file for JSON report
    report_file = Path("pytest_report.json")
    
    # Build pytest command
    # -q: quiet
    # --json-report: generate json report
    # --json-report-file: output path
    cmd = ["pytest", str(tests_dir), "--json-report", f"--json-report-file={report_file}", "-q"]
    
    start_time = datetime.now()
    
    try:
        # Run pytest
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=120
        )
        
        # Parse JSON output
        if report_file.exists():
            with open(report_file, "r") as f:
                pytest_data = json.load(f)
            report_file.unlink() # Clean up
            
            summary = pytest_data.get("summary", {})
            passed = summary.get("passed", 0)
            failed = summary.get("failed", 0)
            errors = summary.get("error", 0) # pytest-json-report uses 'error' count?
            skipped = summary.get("skipped", 0)
            total = summary.get("total", 0)
            
            # Recalculate total if needed (sometimes total matches collected)
            # summary usually has "total", "passed", "failed", "xpassed", "xfailed"...
            
            # Print One-line Results
            print(f"Results: {passed} passed, {failed} failed, {errors} errors, {skipped} skipped (total: {total})")
            
            # Process individual tests
            tests = []
            for test in pytest_data.get("tests", []):
                # outcome: 'passed', 'failed', 'skipped'
                outcome = test.get("outcome")
                nodeid = test.get("nodeid")
                
                # Format checks
                status_icon = "✓" if outcome == "passed" else "✗"
                status_text = "PASS" if outcome == "passed" else outcome.upper()
                
                print(f" [{status_icon} {status_text}] {nodeid}")
                
                tests.append({
                    "nodeid": nodeid,
                    "name": nodeid, # utilizing nodeid as name
                    "outcome": outcome
                })
                
            return {
                "success": (failed == 0 and errors == 0),
                "exit_code": result.returncode,
                "tests": tests,
                "summary": {
                    "total": total,
                    "passed": passed,
                    "failed": failed,
                    "errors": errors,
                    "skipped": skipped,
                },
                "stdout": result.stdout[-3000:],
                "stderr": result.stderr[-1000:],
            }
            
        else:
            print("❌ Failed to generate Pytest JSON report.")
            print("STDOUT:", result.stdout)
            print("STDERR:", result.stderr)
            return {
                "success": False,
                "exit_code": -1,
                "tests": [],
                "summary": {"error": "No report generated"},
                "stdout": result.stdout,
                "stderr": result.stderr
            }

    except subprocess.TimeoutExpired:
        print("❌ Test execution timed out")
        return {
            "success": False,
            "exit_code": -1,
            "tests": [],
            "summary": {"error": "Test execution timed out"},
        }
    except Exception as e:
        print(f"❌ Error running tests: {e}")
        return {
            "success": False,
            "exit_code": -1,
            "tests": [],
            "summary": {"error": str(e)},
        }


def run_evaluation():
    """
    Run complete evaluation.
    """
    print(f"\n{'=' * 60}")
    print("CNC Task EVALUATION")
    print(f"{'=' * 60}")
    
    project_root = Path(__file__).parent.parent
    # In Docker, project_root is /app. tests_dir is /app/tests
    tests_dir = project_root / "tests"
    
    # Run tests with AFTER implementation only
    after_results = run_pytest_tests(
        tests_dir,
        "repository_after"
    )
    
    # Print summary
    print(f"\n{'=' * 60}")
    print("EVALUATION SUMMARY")
    print(f"{'=' * 60}")
    
    passed = after_results.get("summary", {}).get("passed", 0)
    total = after_results.get("summary", {}).get("total", 0)
    success = after_results.get("success", False)

    print(f"\nImplementation (repository_after):")
    print(f"  Overall: {'PASSED' if success else 'FAILED'}")
    print(f"  Tests: {passed}/{total} passed")
    
    # Determine expected behavior
    print(f"\n{'=' * 60}")
    print("EXPECTED BEHAVIOR CHECK")
    print(f"{'=' * 60}")
    
    if success:
        print("[✓ OK] All tests passed (expected)")
    else:
        print("[✗ FAIL] Some tests failed")
    
    return {
        "after": after_results
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
    
    parser = argparse.ArgumentParser(description="Run CNC evaluation")
    parser.add_argument(
        "--output",
        type=str,
        default=None,
        help="Output JSON file path"
    )
    
    args = parser.parse_args()
    
    # Generate run ID and timestamps
    run_id = generate_run_id()
    started_at = datetime.now()
    
    print(f"Run ID: {run_id}")
    print(f"Started at: {started_at.isoformat()}")
    
    try:
        results = run_evaluation()
        
        # Success if after implementation passes all tests
        success = results["after"].get("success", False)
        error_message = None if success else "Tests failed"

    except Exception as e:
        import traceback
        print(f"\nERROR: {str(e)}")
        traceback.print_exc()
        results = None
        success = False
        error_message = str(e)

    finished_at = datetime.now()
    duration = (finished_at - started_at).total_seconds()

    # Collect environment information
    environment = get_environment_info()

    # Build report
    report = {
        "run_id": run_id,
        "task_title": "CNC Path Optimization",
        "started_at": started_at.isoformat(),
        "finished_at": finished_at.isoformat(),
        "start_time": started_at.isoformat(), # redundant but requested
        "end_time": finished_at.isoformat(),
        "duration_seconds": round(duration, 6),
        "overall_status": "PASSED" if success else "FAILED",
        "success": success,
        "error": error_message,
        "environment": environment,
        "test_results": results["after"].get("tests", []) if results else [],
        "results": results,
    }

    # Determine output path
    if args.output:
        output_path = Path(args.output)
    else:
        output_path = generate_output_path()

    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "w") as f:
        json.dump(report, f, indent=2)
    print(f"\nReport saved to:\n{output_path}")

    print(f"\n{'=' * 60}")
    print(f"EVALUATION COMPLETE")
    print(f"{'=' * 60}")
    print(f"Run ID: {run_id}")
    print(f"Duration: {duration:.2f}s")
    print(f"Success: {'YES' if success else 'NO'}")

    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())