#!/usr/bin/env python3
"""
Evaluation script for SwitchableNorm2d implementation.
Follows the same structure as the JavaScript example.
"""

import json
import os
import sys
import subprocess
import uuid
import platform
from datetime import datetime
from pathlib import Path
import traceback

ROOT = Path(__file__).parent.parent
REPORTS_DIR = ROOT / "evaluation" / "reports"
REPORTS_DIR.mkdir(parents=True, exist_ok=True)


def get_environment_info():
    """Get system environment information."""
    try:
        import torch
        torch_info = {
            "torch_version": torch.__version__,
            "cuda_available": torch.cuda.is_available(),
            "cuda_version": torch.version.cuda if torch.cuda.is_available() else None,
            "device_count": torch.cuda.device_count() if torch.cuda.is_available() else 0,
        }
    except Exception as e:
        torch_info = {"torch_version": "not_available", "error": str(e)}
    
    return {
        "python_version": sys.version,
        "platform": platform.platform(),
        "arch": platform.machine(),
        "cpus": os.cpu_count(),
        "pytorch": torch_info,
    }


def run_tests(repo_path):
    """Run pytest for the given repository path and parse detailed results."""
    env = os.environ.copy()
    env["REPO_PATH"] = repo_path
    env["PYTHONPATH"] = str(ROOT)
    
    cmd = [sys.executable, "-m", "pytest", "tests/", "-v", "--tb=no"]
    
    try:
        result = subprocess.run(
            cmd,
            cwd=ROOT,
            env=env,
            capture_output=True,
            text=True,
            timeout=30
        )
        
        output = result.stdout + result.stderr
        
        # Parse the output to count passed/failed tests
        lines = output.split('\n')
        passed = 0
        failed = 0
        skipped = 0
        errors = []
        
        for line in lines:
            if "PASSED" in line:
                passed += 1
            elif "FAILED" in line:
                failed += 1
                # Extract test name
                if "test_" in line:
                    test_name = line.split("::")[-1].split()[0]
                    errors.append(f"{test_name} failed")
            elif "SKIPPED" in line or "xfail" in line.lower():
                skipped += 1
            elif "ERROR" in line and "test_" in line:
                failed += 1
                errors.append(line.strip())
        
        # Determine overall pass/fail
        # For repository_before, we expect failures on optimization requirements
        # For repository_after, we expect all tests to pass
        overall_passed = (failed == 0) and (passed > 0)
        
        # For repository_before, if we have any passed tests, that's actually bad
        # because optimization requirement tests should fail
        if repo_path == "repository_before" and passed > 5:
            # If more than 5 tests passed for repository_before, something is wrong
            overall_passed = False
            errors.append(f"Too many tests passed ({passed}) for repository_before - optimization tests should fail")
        
        output_preview = output[:1000]
        
        return {
            "passed": overall_passed,
            "return_code": result.returncode,
            "output": output_preview,
            "detailed": {
                "passed_count": passed,
                "failed_count": failed,
                "skipped_count": skipped,
                "errors": errors[:5]  # Limit errors in preview
            }
        }
    except subprocess.TimeoutExpired:
        return {
            "passed": False,
            "return_code": -1,
            "output": "Test execution timed out after 30 seconds",
            "detailed": {
                "passed_count": 0,
                "failed_count": 0,
                "skipped_count": 0,
                "errors": ["Timeout"]
            }
        }
    except Exception as e:
        return {
            "passed": False,
            "return_code": -1,
            "output": f"Error running tests: {str(e)}",
            "detailed": {
                "passed_count": 0,
                "failed_count": 0,
                "skipped_count": 0,
                "errors": [str(e)]
            }
        }


def check_original_implementation():
    """Check if the original implementation has the expected issues."""
    repo_before_path = ROOT / "repository_before" / "switchablenorm.py"
    
    if not repo_before_path.exists():
        return {
            "exists": False,
            "has_issues": True,
            "error": "Original implementation not found"
        }
    
    try:
        with open(repo_before_path, 'r') as f:
            content = f.read()
        
        # Check for known issues in the original implementation
        issues = []
        
        if "for c in range(C):" in content:
            issues.append("Python loops over channels")
        if "for n in range(N):" in content:
            issues.append("Python loops over batch")
        if "_redundant_softmax" in content:
            issues.append("Double softmax (_redundant_softmax)")
        if ".clone().detach()" in content:
            issues.append("Unnecessary cloning/detaching")
        if ".expand(" in content or ".repeat(" in content:
            issues.append("Manual broadcasting with expand/repeat")
        if "_manual_mean" in content:
            issues.append("Manual mean calculation")
        if "SwitchableNorm2d_Unholy" in content:
            issues.append("Poor class naming (Unholy)")
        if "self.mean_weight" in content:
            issues.append("Poor variable naming (mean_weight instead of weight_mean)")
        
        # Check for missing features
        if "track_running_stats" not in content:
            issues.append("No track_running_stats parameter")
        if "affine" not in content:
            issues.append("No affine parameter (always affine)")
        
        return {
            "exists": True,
            "has_issues": len(issues) > 0,
            "issues": issues,
            "issue_count": len(issues),
            "should_fail_tests": len(issues) >= 6  # Should fail if has major issues
        }
    except Exception as e:
        return {
            "exists": True,
            "has_issues": True,
            "error": f"Error analyzing original: {str(e)}",
            "should_fail_tests": True
        }


def check_optimized_implementation():
    """Check if the optimized implementation has the fixes."""
    repo_after_path = ROOT / "repository_after" / "switchablenorm.py"
    
    if not repo_after_path.exists():
        return {
            "exists": False,
            "optimizations": [],
            "error": "Optimized implementation not found"
        }
    
    try:
        with open(repo_after_path, 'r') as f:
            content = f.read()
        
        # Check for optimizations in the new implementation
        optimizations = []
        
        if "mean(dim=[" in content and "var(dim=[" in content:
            optimizations.append("Vectorized mean/variance calculations")
        if "softmax" in content and content.count("softmax") <= 2:
            optimizations.append("Single softmax (not double)")
        if ".view(" in content and (".expand(" not in content or ".repeat(" not in content):
            optimizations.append("Implicit broadcasting (no expand/repeat)")
        if "def _check_input_dim" in content:
            optimizations.append("Input validation")
        if "def _compute_statistics" in content:
            optimizations.append("Consolidated statistics computation")
        if "def _get_normalized_weights" in content:
            optimizations.append("Modular weight normalization")
        if "track_running_stats" in content:
            optimizations.append("Configurable running statistics")
        if "affine" in content and "track_running_stats" in content:
            optimizations.append("Configurable parameters")
        if "with torch.no_grad():" in content and "running_mean.mul_" in content:
            optimizations.append("Proper in-place updates for running stats")
        if "SwitchableNorm2d(" in content and "SwitchableNorm2d_Unholy" not in content:
            optimizations.append("Clean class naming")
        if "self.weight_mean" in content and "self.weight_var" in content:
            optimizations.append("Clear variable naming (weight_mean/weight_var)")
        
        return {
            "exists": True,
            "optimizations": optimizations,
            "optimization_count": len(optimizations),
            "should_pass_tests": len(optimizations) >= 8  # Should pass if has optimizations
        }
    except Exception as e:
        return {
            "exists": True,
            "optimizations": [],
            "error": f"Error analyzing optimized: {str(e)}",
            "should_pass_tests": False
        }


def main():
    """Main evaluation function."""
    run_id = str(uuid.uuid4())
    start_time = datetime.now()
    start_time_iso = start_time.isoformat()
    
    print(f"Starting evaluation (Run ID: {run_id})...")
    
    # 1. Run tests against repository_before (Baseline)
    print("\n1. Running baseline tests (repository_before)...")
    before_result = run_tests("repository_before")
    print(f"   Result: {'PASSED' if before_result['passed'] else 'FAILED'}")
    print(f"   Details: {before_result['detailed']['passed_count']} passed, "
          f"{before_result['detailed']['failed_count']} failed, "
          f"{before_result['detailed']['skipped_count']} skipped")
    
    # 2. Run tests against repository_after (Implementation)
    print("\n2. Running implementation tests (repository_after)...")
    after_result = run_tests("repository_after")
    print(f"   Result: {'PASSED' if after_result['passed'] else 'FAILED'}")
    print(f"   Details: {after_result['detailed']['passed_count']} passed, "
          f"{after_result['detailed']['failed_count']} failed, "
          f"{after_result['detailed']['skipped_count']} skipped")
    
    # 3. Analyze implementations
    print("\n3. Analyzing implementations...")
    original_analysis = check_original_implementation()
    optimized_analysis = check_optimized_implementation()
    
    # 4. Generate improvement summary
    end_time = datetime.now()
    end_time_iso = end_time.isoformat()
    duration_seconds = (end_time - start_time).total_seconds()
    
    # Determine if optimization requirements are met
    original_has_issues = original_analysis.get("has_issues", False)
    optimized_has_fixes = optimized_analysis.get("optimization_count", 0) >= 8
    
    # Check test results
    before_failed = not before_result["passed"]
    after_passed = after_result["passed"]
    
    if before_failed and after_passed:
        improvement_summary = "Optimized implementation fixed all issues and passes tests."
        optimization_status = "Optimization requirements met"
    elif not before_failed and after_passed:
        improvement_summary = "Both implementations pass tests (original may not have issues or tests are wrong)."
        optimization_status = "Check test design - original should fail optimization tests"
    elif not after_passed:
        improvement_summary = "Optimized implementation failed to pass tests."
        optimization_status = "Optimization requirements not met"
    else:
        improvement_summary = "No clear improvement detected."
        optimization_status = "Check implementation"
    
    # 5. Construct the Final Report Object
    report = {
        "run_id": run_id,
        "started_at": start_time_iso,
        "finished_at": end_time_iso,
        "duration_seconds": duration_seconds,
        "environment": get_environment_info(),
        "before": {
            "tests": {
                "passed": before_result["passed"],
                "return_code": before_result["return_code"],
                "output": before_result["output"],
                "detailed": before_result["detailed"]
            },
            "analysis": original_analysis,
            "metrics": {}
        },
        "after": {
            "tests": {
                "passed": after_result["passed"],
                "return_code": after_result["return_code"],
                "output": after_result["output"],
                "detailed": after_result["detailed"]
            },
            "analysis": optimized_analysis,
            "metrics": {}
        },
        "comparison": {
            "passed_gate": after_result["passed"],
            "improvement_summary": improvement_summary,
            "optimization_status": optimization_status,
            "test_improvement": before_failed and after_passed,
            "original_has_issues": original_has_issues,
            "optimized_has_fixes": optimized_has_fixes
        },
        "success": after_result["passed"] and (before_failed or not original_has_issues),
        "error": None
    }
    
    # 6. Write the report to disk
    report_path = REPORTS_DIR / "report.json"
    with open(report_path, 'w') as f:
        json.dump(report, f, indent=2, default=str)
    
    # Print summary
    print("\n" + "="*60)
    print("EVALUATION SUMMARY")
    print("="*60)
    print(f"Before tests: {'PASSED' if before_result['passed'] else 'FAILED'} "
          f"({before_result['detailed']['passed_count']}P/{before_result['detailed']['failed_count']}F/{before_result['detailed']['skipped_count']}S)")
    print(f"After tests:  {'PASSED' if after_result['passed'] else 'FAILED'} "
          f"({after_result['detailed']['passed_count']}P/{after_result['detailed']['failed_count']}F/{after_result['detailed']['skipped_count']}S)")
    print(f"Improvement:  {improvement_summary}")
    print(f"Optimization: {optimization_status}")
    print(f"Success:      {report['success']}")
    
    if before_result['detailed']['errors']:
        print(f"\nBefore test errors ({len(before_result['detailed']['errors'])}):")
        for err in before_result['detailed']['errors'][:3]:
            print(f"  - {err}")
    
    print("\n" + "="*60)
    print(f"Report written to: {report_path}")
    print("="*60)
    
    # Exit with status code based on success
    sys.exit(0 if report["success"] else 1)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"Evaluation error: {e}")
        traceback.print_exc()
        
        # Create error report
        error_report = {
            "run_id": str(uuid.uuid4()),
            "error": str(e),
            "success": False,
            "traceback": traceback.format_exc()
        }
        
        report_path = REPORTS_DIR / "report.json"
        with open(report_path, 'w') as f:
            json.dump(error_report, f, indent=2)
        
        sys.exit(1)