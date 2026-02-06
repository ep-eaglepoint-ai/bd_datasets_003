#!/usr/bin/env python3
import os
import sys
import json
import uuid
import platform
import subprocess
import shutil
import xml.etree.ElementTree as ET
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


def run_pytest_tests(tests_dir, label, target_repo):
    """
    Run Pytest tests and parse the output via JUnit XML.
    """
    print(f"\n{'=' * 60}")
    print(f"RUNNING TESTS: {label.upper()}")
    print(f"{'=' * 60}")
    print(f"Tests directory: {tests_dir}")

    # Environment
    env = os.environ.copy()
    env["TARGET_REPO"] = target_repo
    # Ensure project root is in PYTHONPATH
    project_root = Path(tests_dir).parent
    env["PYTHONPATH"] = f"{project_root}:{env.get('PYTHONPATH', '')}"

    # XML output path for parsing (store in evaluation dir to avoid cluttering tests)
    xml_path = project_root / "evaluation" / f"junit_{target_repo}.xml"
    
    cmd = [
        sys.executable, "-m", "pytest", 
        str(tests_dir), 
        "--tb=short", 
        "-v", 
        f"--junitxml={xml_path}"
    ]

    try:
        # Run pytest
        # Run from project root to ensure imports work correctly
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            cwd=str(project_root),
            env=env,
            timeout=120
        )

        stdout = result.stdout
        stderr = result.stderr
        
        # Parse XML
        tests = []
        summary = {
            "total": 0,
            "passed": 0,
            "failed": 0,
            "errors": 0,
            "skipped": 0,
        }

        if xml_path.exists():
            try:
                tree = ET.parse(xml_path)
                root = tree.getroot()
                testsuite = root if root.tag == 'testsuite' else root.find('testsuite')
                
                if testsuite is not None:
                    summary["total"] = int(testsuite.get("tests", 0))
                    summary["failed"] = int(testsuite.get("failures", 0))
                    summary["errors"] = int(testsuite.get("errors", 0))
                    summary["skipped"] = int(testsuite.get("skipped", 0))
                    summary["passed"] = summary["total"] - (summary["failed"] + summary["errors"] + summary["skipped"])

                    for testcase in testsuite.findall('testcase'):
                        classname = testcase.get("classname")
                        name = testcase.get("name")
                        file_attr = testcase.get("file")
                        
                        if file_attr:
                            nodeid = f"{file_attr}::{name}"
                        else:
                            # Fallback
                            file_path = classname.replace(".", "/") + ".py"
                            nodeid = f"{file_path}::{name}"

                        outcome = "passed"
                        if testcase.find('failure') is not None:
                            outcome = "failed"
                        elif testcase.find('error') is not None:
                            outcome = "failed"
                        elif testcase.find('skipped') is not None:
                            outcome = "skipped"
                        
                        tests.append({
                            "nodeid": nodeid,
                            "name": name,
                            "outcome": outcome
                        })
                
                # Cleanup
                os.remove(xml_path)
                
            except Exception as e:
                print(f"❌ Failed to parse XML output: {e}")
                summary["errors"] = 1

        print(f"\nResults: {summary['passed']} passed, {summary['failed']} failed (total: {summary['total']})")
        
        for test in tests:
            status_icon = "✅" if test.get("outcome") == "passed" else "❌"
            print(f"  {status_icon} {test.get('nodeid', 'unknown')}")

        return {
            "success": result.returncode == 0,
            "exit_code": result.returncode,
            "tests": tests,
            "summary": summary,
            "stdout": stdout,
            "stderr": stderr,
        }

    except subprocess.TimeoutExpired:
        print("❌ Test execution timed out")
        return {
            "success": False,
            "exit_code": -1,
            "tests": [],
            "summary": {"error": "Test execution timed out"},
            "stdout": "",
            "stderr": "",
        }
    except Exception as e:
        print(f"❌ Error running tests: {e}")
        return {
            "success": False,
            "exit_code": -1,
            "tests": [],
            "summary": {"error": str(e)},
            "stdout": "",
            "stderr": "",
        }


def run_evaluation():
    """
    Run complete evaluation.
    """
    print(f"\n{'=' * 60}")
    print("Typeahead Search Index EVALUATION")
    print(f"{'=' * 60}")
    
    project_root = Path(__file__).parent.parent
    tests_dir = project_root / "tests"
    
    # Run tests with BEFORE implementation
    # Explicitly FAIL expected for BEFORE
    before_results = run_pytest_tests(
        tests_dir,
        "before (repository_before)",
        "repository_before"
    )
    
    # Run tests with AFTER implementation
    after_results = run_pytest_tests(
        tests_dir,
        "after (repository_after)",
        "repository_after"
    )
    
    # Build comparison
    comparison = {
        "before_tests_passed": before_results.get("success", False),
        "after_tests_passed": after_results.get("success", False),
        "before_total": before_results.get("summary", {}).get("total", 0),
        "before_passed": before_results.get("summary", {}).get("passed", 0),
        "before_failed": before_results.get("summary", {}).get("failed", 0),
        "after_total": after_results.get("summary", {}).get("total", 0),
        "after_passed": after_results.get("summary", {}).get("passed", 0),
        "after_failed": after_results.get("summary", {}).get("failed", 0),
    }
    
    # Print summary
    print(f"\n{'=' * 60}")
    print("EVALUATION SUMMARY")
    print(f"{'=' * 60}")
    
    print(f"\nBefore Implementation (repository_before):")
    print(f"  Overall: {'✅ PASSED' if before_results.get('success') else '❌ FAILED'}")
    print(f"  Tests: {comparison['before_passed']}/{comparison['before_total']} passed")
    
    print(f"\nAfter Implementation (repository_after):")
    print(f"  Overall: {'✅ PASSED' if after_results.get('success') else '❌ FAILED'}")
    print(f"  Tests: {comparison['after_passed']}/{comparison['after_total']} passed")
    
    # Determine expected behavior
    print(f"\n{'=' * 60}")
    print("EXPECTED BEHAVIOR CHECK")
    print(f"{'=' * 60}")
    
    if after_results.get("success"):
        print("✅ After implementation: All tests passed (expected)")
    else:
        print("❌ After implementation: Some tests failed (unexpected - should pass all)")
    
    return {
        "before": before_results,
        "after": after_results,
        "comparison": comparison,
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
    
    parser = argparse.ArgumentParser(description="Run mechanical refactor evaluation")
    parser.add_argument(
        "--output",
        type=str,
        default=None,
        help="Output JSON file path (default: evaluation/YYYY-MM-DD/HH-MM-SS/report.json)"
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
        error_message = None if success else "After implementation tests failed"

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
        "started_at": started_at.isoformat(),
        "finished_at": finished_at.isoformat(),
        "duration_seconds": round(duration, 6),
        "success": success,
        "error": error_message,
        "environment": environment,
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
    print(f"\n✅ Report saved to: {output_path}")

    print(f"\n{'=' * 60}")
    print(f"EVALUATION COMPLETE")
    print(f"{'=' * 60}")
    print(f"Run ID: {run_id}")
    print(f"Duration: {duration:.2f}s")
    print(f"Success: {'✅ YES' if success else '❌ NO'}")

    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
