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


def build_repo(repo_path):
    """Build the C++ project in the given repo path."""
    print(f"Building {repo_path}...")
    build_dir = Path(repo_path) / "build"
    build_dir.mkdir(exist_ok=True)
    
    # Check if CMakeLists exists
    if not (Path(repo_path) / "CMakeLists.txt").exists():
        print(f"No CMakeLists.txt in {repo_path}, skipping build.")
        return True # Assume it's fine or script mode? 
        # Actually repository_before might effectively be empty or not buildable if it's "without implementation" 
        # but the task implies we run tests against it. 
        # If it doesn't build, tests will fail (executable not found), which is expected for 'before'.

    try:
        subprocess.run(
            ["cmake", ".."],
            cwd=str(build_dir),
            check=True,
            capture_output=True
        )
        subprocess.run(
            ["make"],
            cwd=str(build_dir),
            check=True,
            capture_output=True
        )
        return True
    except subprocess.CalledProcessError as e:
        print(f"Build failed for {repo_path}: {e}")
        return False


def run_pytest_tests(tests_dir, label, target_repo):
    """
    Run Pytest tests and parse the JSON output.
    """
    print(f"\n{'=' * 60}")
    print(f"RUNNING TESTS: {label.upper()}")
    print(f"{'=' * 60}")
    print(f"Tests directory: {tests_dir}")

    # Build first
    build_success = build_repo(target_repo)
    if not build_success:
        print(f"❌ Build failed for {target_repo}")
        # Continue to run tests? They will fail.
    
    # Build pytest command with JSON report
    # We use --report-log instead of --json if available, or just parse generic output?
    # Pytest doesn't have built-in --json without plugins usually, but we can use --junitxml or just parse stdout.
    # OR we can install pytest-json-report? Not in Dockerfile.
    # Let's use a simple parsing wrapper or just check exit code.
    # Wait, previous evaluation.py parsed JSON from Jest.
    # To get JSON from pytest easily without plugins, it's hard.
    # BUT, we can just run it and check exit code for success/failure, 
    # and maybe parse the summary line "X passed, Y failed".
    
    # Actually, let's use a custom collector or just standard output parsing.
    # Command: pytest -q tests 
    
    cmd = ["pytest", "-v", str(tests_dir)]
    
    # Environment
    env = os.environ.copy()
    env["TARGET_REPO"] = target_repo

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            cwd=str(tests_dir.parent), # run from root usually
            env=env,
            timeout=120
        )

        stdout = result.stdout
        stderr = result.stderr
        
        # Simple parsing of stdout for summary
        # "2 passed, 1 failed in 0.12s"
        passed = 0
        failed = 0
        total = 0
        
        lines = stdout.splitlines()
        summary_line = ""
        for line in lines:
            if "passed" in line or "failed" in line:
                summary_line = line
        
        # This is brittle but works for simple cases. 
        # Let's count "PASSED" and "FAILED" lines if -v is used.
        tests = []
        for line in lines:
            if "::" in line:
                parts = line.split("::")
                test_name = parts[-1].split(" ")[0]
                outcome = "unknown"
                if "PASSED" in line:
                    outcome = "passed"
                    passed += 1
                elif "FAILED" in line:
                    outcome = "failed"
                    failed += 1
                elif "ERROR" in line:
                    outcome = "error"
                    failed += 1
                
                if outcome != "unknown":
                   tests.append({
                       "name": test_name,
                       "outcome": outcome,
                       "nodeid": line.split(" ")[0]
                   })

        total = passed + failed
        
        print(f"\nResults: {passed} passed, {failed} failed (total: {total})")
        
        # Print individual test results
        for test in tests:
            status_icon = "✅" if test.get("outcome") == "passed" else "❌"
            print(f"  {status_icon} {test.get('name', 'unknown')}")

        return {
            "success": result.returncode == 0,
            "exit_code": result.returncode,
            "tests": tests,
            "summary": {
                "total": total,
                "passed": passed,
                "failed": failed,
                "errors": 0,
                "skipped": 0,
            },
            "stdout": stdout[-3000:] if len(stdout) > 3000 else stdout,
            "stderr": stderr[-1000:] if len(stderr) > 1000 else stderr,
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
    print("JSON Parser EVALUATION")
    print(f"{'=' * 60}")
    
    project_root = Path(__file__).parent.parent
    tests_dir = project_root / "tests"
    
    # Run tests with BEFORE implementation
    print(f"\n{'=' * 60}")
    print("RUNNING TESTS: BEFORE (repository_before)")
    print(f"{'=' * 60}")
    
    before_results = run_pytest_tests(
        tests_dir,
        "before (repository_before)",
        "repository_before"
    )
    
    # Run tests with AFTER implementation
    print(f"\n{'=' * 60}")
    print("RUNNING TESTS: AFTER (repository_after)")
    print(f"\n{'=' * 60}") # Double header fixed
    
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
    print(f"  Overall: {'✅ PASSED' if before_results.get('success') else '❌ FAILED (Expected)'}")
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
    
    # Check if before failed (as expected) or not
    # We expect before to fail some tests (e.g. deep nesting, unicode)
    if not before_results.get("success"):
        print("✅ Before implementation: Tests failed (expected)")
    else:
        print("⚠️ Before implementation: All tests passed (unexpected?)")
    
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
    
    parser = argparse.ArgumentParser(description="Run evaluation")
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

    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())