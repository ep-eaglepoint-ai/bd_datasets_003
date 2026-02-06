"""
Evaluation script for Task Scheduler solution.

This script runs tests and generates a JSON report with test results,
statistics, and evaluation metrics.
"""

import json
import sys
import os
import subprocess
import time
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Any


def run_pytest_tests(test_path: str = "tests") -> Dict[str, Any]:
    """
    Run pytest tests and capture results.
    
    Args:
        test_path: Path to test directory or file
        
    Returns:
        Dictionary containing test results and statistics
    """
    print(f"Running tests from {test_path}...")
    
    start_time = time.time()
    
    # Run pytest with verbose output
    try:
        result = subprocess.run(
            ["pytest", test_path, "-v", "--tb=short"],
            capture_output=True,
            text=True,
            timeout=300  # 5 minute timeout
        )
        
        duration = time.time() - start_time
        
        # Parse stdout for test results
        stdout_lines = result.stdout.split('\n')
        stderr_lines = result.stderr.split('\n')
        
        # Extract test counts from summary line
        passed = 0
        failed = 0
        skipped = 0
        errors = 0
        total = 0
        
        # Look for summary line like "28 passed in 1.00s"
        for line in stdout_lines:
            line_lower = line.lower()
            if "passed" in line_lower or "failed" in line_lower or "skipped" in line_lower:
                # Try to extract numbers
                parts = line.split()
                for i, part in enumerate(parts):
                    try:
                        num = int(part)
                        if i + 1 < len(parts):
                            next_word = parts[i + 1].lower()
                            if "passed" in next_word:
                                passed = num
                            elif "failed" in next_word:
                                failed = num
                            elif "skipped" in next_word:
                                skipped = num
                            elif "error" in next_word:
                                errors = num
                    except ValueError:
                        continue
        
        # Extract individual test results
        tests = []
        for line in stdout_lines:
            if "::" in line:
                # Test line format: "tests/test_solution.py::TestClass::test_method PASSED"
                if "PASSED" in line or "FAILED" in line or "SKIPPED" in line or "ERROR" in line:
                    parts = line.split()
                    if len(parts) >= 2:
                        test_name = parts[0]
                        outcome = "unknown"
                        if "PASSED" in line:
                            outcome = "passed"
                        elif "FAILED" in line:
                            outcome = "failed"
                        elif "SKIPPED" in line:
                            outcome = "skipped"
                        elif "ERROR" in line:
                            outcome = "error"
                        
                        tests.append({
                            "nodeid": test_name,
                            "outcome": outcome
                        })
        
        # Calculate total if not found
        if total == 0:
            total = passed + failed + skipped + errors
        
        return {
            "success": result.returncode == 0,
            "return_code": result.returncode,
            "total_tests": total,
            "passed": passed,
            "failed": failed,
            "skipped": skipped,
            "errors": errors,
            "duration": round(duration, 2),
            "tests": tests,
            "stdout": result.stdout,
            "stderr": result.stderr
        }
        
    except subprocess.TimeoutExpired:
        return {
            "success": False,
            "return_code": -1,
            "error": "Test execution timed out",
            "total_tests": 0,
            "passed": 0,
            "failed": 0,
            "skipped": 0,
            "errors": 1,
            "duration": 300
        }
    except Exception as e:
        return {
            "success": False,
            "return_code": -1,
            "error": str(e),
            "total_tests": 0,
            "passed": 0,
            "failed": 0,
            "skipped": 0,
            "errors": 1,
            "duration": 0
        }


def evaluate_solution(repository_path: str = "repository_after") -> Dict[str, Any]:
    """
    Evaluate the solution by running tests.
    
    Args:
        repository_path: Path to repository containing solution
        
    Returns:
        Evaluation results dictionary
    """
    original_dir = os.getcwd()
    evaluation_results = {
        "timestamp": datetime.now().isoformat(),
        "repository": repository_path,
        "evaluation_status": "unknown"
    }
    
    try:
        # Tests are at root level, solution is in repository_path
        # Add repository to Python path for imports
        repo_path = Path(repository_path)
        if repo_path.exists():
            # Add repository to sys.path so tests can import solution
            repo_abs_path = str(repo_path.resolve())
            if repo_abs_path not in sys.path:
                sys.path.insert(0, repo_abs_path)
            print(f"Added {repository_path} to Python path")
        
        # Run tests from root directory (tests folder is at root)
        test_results = run_pytest_tests("tests")
        
        # Calculate pass rate
        total = test_results.get("total_tests", 0)
        passed = test_results.get("passed", 0)
        pass_rate = (passed / total * 100) if total > 0 else 0
        
        evaluation_results.update({
            "evaluation_status": "success" if test_results.get("success") else "failure",
            "test_results": test_results,
            "pass_rate": round(pass_rate, 2),
            "summary": {
                "total_tests": total,
                "passed": passed,
                "failed": test_results.get("failed", 0),
                "skipped": test_results.get("skipped", 0),
                "errors": test_results.get("errors", 0),
                "pass_rate_percent": round(pass_rate, 2)
            }
        })
        
        # Add detailed test breakdown
        if test_results.get("tests"):
            test_outcomes = {}
            for test in test_results["tests"]:
                outcome = test.get("outcome", "unknown")
                test_outcomes[outcome] = test_outcomes.get(outcome, 0) + 1
            evaluation_results["test_breakdown"] = test_outcomes
        
    except Exception as e:
        evaluation_results.update({
            "evaluation_status": "error",
            "error": str(e)
        })
    finally:
        os.chdir(original_dir)
    
    return evaluation_results


def generate_report(evaluation_results: Dict[str, Any], output_file: str = "evaluation_report.json") -> None:
    """
    Generate JSON evaluation report.
    
    Args:
        evaluation_results: Dictionary containing evaluation results
        output_file: Output file path for JSON report
    """
    report = {
        "evaluation": evaluation_results,
        "metadata": {
            "generated_at": datetime.now().isoformat(),
            "python_version": sys.version,
            "platform": sys.platform
        }
    }
    
    # Write report to file
    output_path = Path("evaluation") / output_file
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_path, "w") as f:
        json.dump(report, f, indent=2)
    
    print(f"\nEvaluation report saved to: {output_path}")
    print(f"\nSummary:")
    print(f"  Status: {evaluation_results.get('evaluation_status', 'unknown')}")
    if "summary" in evaluation_results:
        summary = evaluation_results["summary"]
        print(f"  Total Tests: {summary.get('total_tests', 0)}")
        print(f"  Passed: {summary.get('passed', 0)}")
        print(f"  Failed: {summary.get('failed', 0)}")
        print(f"  Pass Rate: {summary.get('pass_rate_percent', 0)}%")


def compare_repositories(before_path: str = "repository_before", 
                        after_path: str = "repository_after") -> Dict[str, Any]:
    """
    Compare test results between before and after repositories.
    
    Args:
        before_path: Path to before repository
        after_path: Path to after repository
        
    Returns:
        Comparison results dictionary
    """
    comparison = {
        "timestamp": datetime.now().isoformat(),
        "before": None,
        "after": None,
        "improvement": {}
    }
    
    # Evaluate before (if exists)
    if Path(before_path).exists():
        print(f"\nEvaluating {before_path}...")
        comparison["before"] = evaluate_solution(before_path)
    
    # Evaluate after
    print(f"\nEvaluating {after_path}...")
    comparison["after"] = evaluate_solution(after_path)
    
    # Calculate improvement
    if comparison["before"] and comparison["after"]:
        before_summary = comparison["before"].get("summary", {})
        after_summary = comparison["after"].get("summary", {})
        
        before_passed = before_summary.get("passed", 0)
        after_passed = after_summary.get("passed", 0)
        
        comparison["improvement"] = {
            "tests_improved": after_passed - before_passed,
            "before_pass_rate": before_summary.get("pass_rate_percent", 0),
            "after_pass_rate": after_summary.get("pass_rate_percent", 0),
            "pass_rate_improvement": round(
                after_summary.get("pass_rate_percent", 0) - before_summary.get("pass_rate_percent", 0), 
                2
            )
        }
    
    return comparison


def main():
    """Main evaluation function."""
    import argparse
    
    # Check for REPO_PATH environment variable (for Docker compatibility)
    default_repo = os.environ.get("REPO_PATH", "repository_after")
    
    parser = argparse.ArgumentParser(description="Evaluate Task Scheduler solution")
    parser.add_argument(
        "--repository",
        type=str,
        default=default_repo,
        help="Repository path to evaluate (default: repository_after or REPO_PATH env var)"
    )
    parser.add_argument(
        "--compare",
        action="store_true",
        help="Compare before and after repositories"
    )
    parser.add_argument(
        "--output",
        type=str,
        default="evaluation_report.json",
        help="Output JSON report file name (default: evaluation_report.json)"
    )
    
    args = parser.parse_args()
    
    if args.compare:
        print("Running comparison evaluation...")
        comparison = compare_repositories()
        
        # Generate comparison report
        report = {
            "comparison": comparison,
            "metadata": {
                "generated_at": datetime.now().isoformat(),
                "python_version": sys.version,
                "platform": sys.platform
            }
        }
        
        output_path = Path("evaluation") / args.output
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(output_path, "w") as f:
            json.dump(report, f, indent=2)
        
        print(f"\nComparison report saved to: {output_path}")
        if comparison.get("improvement"):
            imp = comparison["improvement"]
            print(f"\nImprovement Summary:")
            print(f"  Tests Improved: {imp.get('tests_improved', 0)}")
            print(f"  Pass Rate Improvement: {imp.get('pass_rate_improvement', 0)}%")
    else:
        print(f"Evaluating {args.repository}...")
        results = evaluate_solution(args.repository)
        generate_report(results, args.output)
    
    return 0


if __name__ == "__main__":
    sys.exit(main())

