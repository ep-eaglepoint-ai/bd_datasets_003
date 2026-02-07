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


def parse_pytest_output(output):
    """
    Parse standard pytest output to extract result counts.
    Since we are not using --json-report plugin (to keep deps minimal), we use heuristics.
    """
    passed = 0
    failed = 0
    total = 0
    skipped = 0
    
    lines = output.splitlines()
    for line in lines:
        if " passed, " in line or " passed in " in line or " failed, " in line:
            # Example: "==== 4 passed, 1 failed in 0.12s ===="
            parts = line.split()
            for i, p in enumerate(parts):
                if p == "passed" or p == "passed,":
                    try: 
                        passed = int(parts[i-1])
                    except: pass
                if p == "failed" or p == "failed,":
                     try:
                        failed = int(parts[i-1])
                     except: pass
                if p == "skipped" or p == "skipped,":
                     try:
                        skipped = int(parts[i-1])
                     except: pass
    
    total = passed + failed + skipped
    return passed, failed, skipped, total


def run_pytest_tests(tests_dir, label, target_repo):
    """
    Run Pytest tests and parse the output.
    """
    print(f"\n{'=' * 60}")
    print(f"RUNNING META-TESTS AGAINST: {label.upper()}")
    print(f"{'=' * 60}")
    print(f"Tests directory: {tests_dir}")
    print(f"Target Repo: {target_repo}")

    # Environment
    env = os.environ.copy()
    env["TARGET_REPO"] = target_repo
    
    # Run tests
    # We run the META tests, which will inspect the target repo
    # If tests_dir is a list, pass multiple args
    cmd = ["pytest", "-s"] # -s enables stdout for metrics
    if isinstance(tests_dir, list):
        cmd.extend([str(p) for p in tests_dir])
    else:
        cmd.append(str(tests_dir))
    
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            env=env,
            timeout=120
        )

        stdout = result.stdout
        stderr = result.stderr
        
        passed, failed, skipped, total = parse_pytest_output(stdout)
        
        # Parse custom metrics from STDOUT
        # Format: METRIC: Name=Value
        metrics = {}
        for line in stdout.splitlines():
            if "METRIC:" in line:
                try:
                    parts = line.split("METRIC:")[1].strip().split("=")
                    key = parts[0].strip()
                    val_str = parts[1].strip()
                    # Try to parse as float/int
                    if "s" in val_str and val_str.endswith("s"):
                        val = float(val_str.replace("s", ""))
                    elif "." in val_str:
                        val = float(val_str)
                    else:
                        val = int(val_str)
                    
                    # Store
                    if key not in metrics:
                         metrics[key] = []
                    metrics[key].append(val)
                except:
                    pass
        
        # Summarize metrics (e.g. max recovery latency, total violations)
        final_metrics = {}
        for k, vals in metrics.items():
            if k == "SafetyViolations":
                 final_metrics["total_safety_violations"] = sum(vals)
            elif k == "RecoveryLatency":
                 if vals:
                     final_metrics["recovery_latency_min_s"] = min(vals)
                     final_metrics["recovery_latency_max_s"] = max(vals)
                     final_metrics["recovery_latency_avg_s"] = sum(vals) / len(vals)
                 else:
                     final_metrics["recovery_latency_avg_s"] = 0
        
        print(f"\nResults: {passed} passed, {failed} failed, {skipped} skipped (total: {total})")
        if final_metrics:
            print(f"Metrics: {final_metrics}")

        print(stdout)
        if stderr:
            print("STDERR:")
            print(stderr)

        return {
            "success": result.returncode == 0,
            "exit_code": result.returncode,
            "summary": {
                "total": total,
                "passed": passed,
                "failed": failed,
                "skipped": skipped,
                "errors": 0,
            },
            "metrics": final_metrics,
            "stdout": stdout[-3000:] if len(stdout) > 3000 else stdout,
            "stderr": stderr[-1000:] if len(stderr) > 1000 else stderr,
        }

    except subprocess.TimeoutExpired:
        print("❌ Test execution timed out")
        return {
            "success": False,
            "exit_code": -1,
            "summary": {"error": "Test execution timed out"},
            "stdout": "",
            "stderr": "",
        }
    except Exception as e:
        print(f"❌ Error running tests: {e}")
        return {
            "success": False,
            "exit_code": -1,
            "summary": {"error": str(e)},
            "stdout": "",
            "stderr": "",
        }


def run_evaluation():
    """
    Run complete evaluation.
    """
    print(f"\n{'=' * 60}")
    print("RAFT CONSENSUS CHAOS EVALUATION")
    print(f"{'=' * 60}")
    
    # We assume we are in /app or project root.
    # The tests folder is expected to be at /app/tests or ./tests
    project_root = Path("/app") 
    if not project_root.exists():
         project_root = Path(__file__).parent.parent
         
    tests_dir = project_root / "tests"
    
    # Run tests with BEFORE implementation
    # Expected to FAIL
    print(f"\n{'=' * 60}")
    print("RUNNING TESTS: BEFORE (repository_before)")
    print(f"{'=' * 60}")
    
    before_results = run_pytest_tests(
        tests_dir,
        "before (repository_before)",
        "repository_before"
    )
    
    # Run tests with AFTER implementation
    # Expected to PASS
    print(f"\n{'=' * 60}")
    print("RUNNING TESTS: AFTER (repository_after)")
    print(f"{'=' * 60}")
    
    after_results = run_pytest_tests(
        [tests_dir, "/app/repository_after"],
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
    
    checks_ok = True
    
    # Before should FAIL because tests don't exist there
    if not before_results.get("success"):
        print("✅ Before implementation: Tests failed/missing (expected)")
    else:
        print("❌ Before implementation: Tests passed (unexpected, should fail)")
        checks_ok = False
        
    # After should PASS
    if after_results.get("success"):
        print("✅ After implementation: All tests passed (expected)")
    else:
        print("❌ After implementation: Some tests failed (unexpected)")
        checks_ok = False
        
    # Generate Patch (as per original requirement)
    if os.path.exists("/app/repository_before") and os.path.exists("/app/repository_after"):
         os.makedirs("/app/patches", exist_ok=True)
         subprocess.run("git diff --no-index repository_before repository_after > /app/patches/diff.patch", shell=True)
    
    return {
        "before": before_results,
        "after": after_results,
        "comparison": comparison,
        "success": checks_ok
    }


def generate_output_path():
    """Generate output path in format: evaluation/YYYY-MM-DD/HH-MM-SS/report.json"""
    now = datetime.now()
    date_str = now.strftime("%Y-%m-%d")
    time_str = now.strftime("%H-%M-%S")
    
    # Default to /app
    project_root = Path("/app")
    if not project_root.exists():
         project_root = Path(__file__).parent.parent
         
    output_dir = project_root / "evaluation" / date_str / time_str
    output_dir.mkdir(parents=True, exist_ok=True)
    
    return output_dir / "report.json"


def main():
    """Main entry point for evaluation."""
    
    # Generate run ID and timestamps
    run_id = generate_run_id()
    started_at = datetime.now()
    
    print(f"Run ID: {run_id}")
    print(f"Started at: {started_at.isoformat()}")
    
    try:
        results = run_evaluation()
        success = results.get("success", False)
        error_message = None if success else "Behavior check failed"

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
        "task_title": "Raft Consensus Chaos Testing", 
        "started_at": started_at.isoformat(),
        "finished_at": finished_at.isoformat(),
        "duration_seconds": round(duration, 6),
        "success": success,
        "error": error_message,
        "environment": environment,
        "results": results,
    }

    # Determine output path
    output_path = generate_output_path()

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