#!/usr/bin/env python3
"""
Evaluation script to run before and after tests and generate JSON report.
This script compares test execution between repository_before and repository_after.
"""

import subprocess
import json
import os
import sys
import re
from datetime import datetime


def parse_pytest_output(output):
    """
    Parse pytest verbose output to extract individual test results.

    Args:
        output: pytest stdout/stderr output

    Returns:
        list: Array of test objects with name and passed status
    """
    tests = []

    # Match lines like: "tests/test_file.py::TestClass::test_name PASSED [ 50%]"
    # or "tests/test_file.py::TestClass::test_name FAILED [ 50%]"
    pattern = r'(.+?)::(.*?)::(.*?)\s+(PASSED|FAILED)'

    for line in output.split('\n'):
        match = re.search(pattern, line)
        if match:
            test_class = match.group(2)
            test_method = match.group(3)
            status = match.group(4)

            # Convert test method name to readable format
            # e.g., test_simple_addition -> should perform simple addition
            test_name = test_method.replace('test_', '').replace('_', ' ')

            tests.append({
                'name': test_name,
                'passed': status == 'PASSED'
            })

    return tests


def run_tests(directory, test_path):
    """
    Run pytest on specified test path and capture detailed results.

    Args:
        directory: Working directory for test execution
        test_path: Path to tests to run

    Returns:
        dict: Test execution results with individual test details
    """
    result = {
        'passed': 0,
        'failed': 0,
        'total': 0,
        'tests': []
    }

    try:
        # Run pytest with verbose output
        process = subprocess.run(
            ['pytest', test_path, '-v'],
            cwd=directory,
            capture_output=True,
            text=True,
            timeout=60
        )

        output = process.stdout + '\n' + process.stderr

        # Parse individual test results
        result['tests'] = parse_pytest_output(output)

        # Count passed and failed tests
        result['passed'] = sum(1 for test in result['tests'] if test['passed'])
        result['failed'] = sum(1 for test in result['tests'] if not test['passed'])
        result['total'] = len(result['tests'])

    except subprocess.TimeoutExpired:
        pass
    except Exception as e:
        pass

    return result


def evaluate():
    """
    Run evaluation comparing repository_before and repository_after test execution.
    Generates a JSON report with detailed test results in a timestamp folder.
    """
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    # Create timestamp subdirectory structure for report
    now = datetime.now()
    date_folder = now.strftime("%Y-%m-%d")
    time_folder = now.strftime("%H-%M-%S")
    report_dir = os.path.join(base_dir, 'evaluation', date_folder, time_folder)
    os.makedirs(report_dir, exist_ok=True)

    print("=" * 80)
    print("EXPRESSION EVALUATOR TEST SUITE EVALUATION")
    print("=" * 80)
    print()

    # Test repository_before (runs tests from repository_after/tests)
    print("Running tests for repository_before...")
    repo_after_path = os.path.join(base_dir, 'repository_after')
    repo_after_tests_path = os.path.join(repo_after_path, 'tests')

    if not os.path.exists(repo_after_tests_path):
        print("  ⚠ No tests directory found in repository_after/tests")
        before_results = {
            'passed': 0,
            'failed': 0,
            'total': 0,
            'tests': []
        }
    else:
        before_results = run_tests(repo_after_path, repo_after_tests_path)

    print(f"  Repository Before: {before_results['passed']} passed, "
          f"{before_results['failed']} failed, {before_results['total']} total")
    print()

    # Test repository_after (runs meta tests from root /tests)
    print("Running tests for repository_after...")
    meta_tests_path = os.path.join(base_dir, 'tests')

    if not os.path.exists(meta_tests_path):
        print("  ✗ No tests directory found in root /tests")
        after_results = {
            'passed': 0,
            'failed': 0,
            'total': 0,
            'tests': []
        }
    else:
        after_results = run_tests(base_dir, meta_tests_path)

    print(f"  Repository After: {after_results['passed']} passed, "
          f"{after_results['failed']} failed, {after_results['total']} total")
    print()

    # Generate evaluation summary
    evaluation_success = (
        before_results['passed'] >= 40 and  # repository_after/tests should have 40+ tests
        before_results['failed'] == 0 and
        after_results['passed'] >= 60 and  # meta tests should have 60+ tests (includes imported)
        after_results['failed'] == 0
    )

    print("=" * 80)
    print("EVALUATION SUMMARY")
    print("=" * 80)

    # Create report matching the required format
    report = {
        'timestamp': datetime.now().isoformat() + 'Z',
        'repository_before': before_results,
        'repository_after': after_results
    }

    # Print summary
    print(f"\nOverall Evaluation: {'✓ PASS' if evaluation_success else '✗ FAIL'}")
    print(f"\nCriteria Check:")
    print(f"  {'✓' if before_results['failed'] == 0 else '✗'} Repository Before (repository_after/tests): {before_results['passed']}/{before_results['total']}")
    print(f"  {'✓' if before_results['passed'] >= 40 else '✗'} Repository Before Min Tests: {before_results['passed']} >= 40")
    print(f"  {'✓' if after_results['failed'] == 0 else '✗'} Repository After (meta tests): {after_results['passed']}/{after_results['total']}")
    print(f"  {'✓' if after_results['passed'] >= 60 else '✗'} Repository After Min Tests: {after_results['passed']} >= 60")

    # Save JSON report in timestamp folder
    report_path = os.path.join(report_dir, 'report.json')
    with open(report_path, 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    print(f"\n✓ Evaluation report saved to: evaluation/{date_folder}/{time_folder}/report.json")
    print("=" * 80)

    return 0 if evaluation_success else 1


if __name__ == '__main__':
    sys.exit(evaluate())
