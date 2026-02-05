"""
Evaluation script that runs tests against both repositories and generates report.json
"""

import sys
import os
import json
import subprocess
from datetime import datetime, timezone

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))


def run_pytest_for_repo(repo_name):
    """Run pytest for a specific repository and capture results"""
    env = os.environ.copy()
    env['TEST_REPO'] = repo_name

    # Run pytest with verbose output
    result = subprocess.run(
        ['pytest', '-v', 'tests/test_sanitizer.py', '--tb=short'],
        env=env,
        capture_output=True,
        text=True
    )

    # Parse pytest output to extract test results
    tests = []
    passed = 0
    failed = 0

    lines = result.stdout.split('\n') + result.stderr.split('\n')

    for line in lines:
        if 'test_sanitizer.py::test_' in line:
            # Extract test name and result
            if ' PASSED' in line:
                test_name = line.split('::test_')[1].split(' PASSED')[0]
                test_name = test_name.replace('_', ' ')
                tests.append({"name": test_name, "passed": True})
                passed += 1
            elif ' FAILED' in line:
                test_name = line.split('::test_')[1].split(' FAILED')[0]
                test_name = test_name.replace('_', ' ')
                tests.append({"name": test_name, "passed": False})
                failed += 1

    total = passed + failed

    return {
        "passed": passed,
        "failed": failed,
        "total": total,
        "tests": tests
    }


def main():
    print("=" * 70)
    print("Text Stream Optimization - Performance Evaluation")
    print("=" * 70)

    print("\n[1/2] Running tests against repository_before (Legacy O(N²))...")
    before_results = run_pytest_for_repo('before')
    print(f"  Passed: {before_results['passed']}, Failed: {before_results['failed']}, Total: {before_results['total']}")

    print("\n[2/2] Running tests against repository_after (Optimized O(N))...")
    after_results = run_pytest_for_repo('after')
    print(f"  Passed: {after_results['passed']}, Failed: {after_results['failed']}, Total: {after_results['total']}")

    # Generate report
    report = {
        "timestamp": datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
        "repository_before": before_results,
        "repository_after": after_results
    }

    # Create timestamp directory
    timestamp_str = datetime.now(timezone.utc).strftime('%Y-%m-%d/%H-%M-%S')
    output_dir = os.path.join('evaluation', timestamp_str)
    os.makedirs(output_dir, exist_ok=True)

    report_path = os.path.join(output_dir, 'report.json')

    # Write report to file
    with open(report_path, 'w') as f:
        json.dump(report, f, indent=2)

    print("\n" + "=" * 70)
    print("Evaluation Complete")
    print("=" * 70)
    print(f"\nRepository Before (Legacy): {before_results['passed']}/{before_results['total']} tests passed")
    print(f"Repository After (Optimized): {after_results['passed']}/{after_results['total']} tests passed")
    print(f"\nReport saved to: {report_path}")

    # Exit with success regardless of test results
    sys.exit(0)


if __name__ == '__main__':
    main()
