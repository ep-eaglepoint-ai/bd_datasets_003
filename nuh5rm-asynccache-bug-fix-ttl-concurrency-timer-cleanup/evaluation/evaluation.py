#!/usr/bin/env python3
"""
Evaluation Script for NUH5RM - AsyncCache Bug Fix
Tests both repository_before and repository_after
Generates evaluation/report.json
"""

import subprocess
import json
import os
import sys

# Use current working directory
APP_DIR = os.getcwd()

def run_node_tests(module_path):
    """Run Node.js tests on specified module"""
    os.chdir(APP_DIR)

    try:
        result = subprocess.run(
            ['node', 'tests/test_runner.js', module_path],
            capture_output=True,
            text=True,
            timeout=60
        )

        output = result.stdout + result.stderr

        # Parse test results
        passed = 0
        failed = 0

        for line in output.split('\n'):
            if line.startswith('Passed:'):
                passed = int(line.split(':')[1].strip())
            elif line.startswith('Failed:'):
                failed = int(line.split(':')[1].strip())

        return {
            'passed': passed,
            'failed': failed,
            'total': passed + failed,
            'success': failed == 0,
            'output': output[-5000:]
        }
    except subprocess.TimeoutExpired:
        return {
            'passed': 0,
            'failed': 1,
            'total': 1,
            'success': False,
            'error': 'Test timeout'
        }
    except Exception as e:
        return {
            'passed': 0,
            'failed': 1,
            'total': 1,
            'success': False,
            'error': str(e)
        }

def main():
    """Run evaluation on both repositories"""
    print("=== AsyncCache Evaluation ===\n")
    print(f"Working directory: {APP_DIR}\n")

    # Test repository_before (expected to fail - this is the buggy version)
    print("Testing repository_before (original - expected to have some failures)...")
    before_result = run_node_tests('repository_before/AysncCache.js')
    before_result['repository'] = 'before'
    print(f"  Passed: {before_result['passed']}, Failed: {before_result['failed']}\n")

    # Test repository_after (should pass all tests)
    print("Testing repository_after (fixed - should pass all tests)...")
    after_result = run_node_tests('repository_after/AsyncCache.js')
    after_result['repository'] = 'after'
    print(f"  Passed: {after_result['passed']}, Failed: {after_result['failed']}\n")

    # Generate combined report
    report = {
        'evaluation': 'NUH5RM - AsyncCache Bug Fix: TTL, Concurrency & Timer Cleanup',
        'before': before_result,
        'after': after_result,
        'summary': {
            'before_passed': before_result['passed'],
            'before_failed': before_result['failed'],
            'after_passed': after_result['passed'],
            'after_failed': after_result['failed'],
            'improvement': (after_result['passed'] - before_result['passed']),
            'before_working': before_result['success'],
            'after_working': after_result['success']
        }
    }

    # Ensure evaluation directory exists
    eval_dir = os.path.join(APP_DIR, 'evaluation')
    os.makedirs(eval_dir, exist_ok=True)

    # Write report.json
    report_path = os.path.join(eval_dir, 'report.json')
    with open(report_path, 'w') as f:
        json.dump(report, f, indent=2)

    print("=== Evaluation Summary ===")
    print(f"Before: {before_result['passed']}/{before_result['total']} passed")
    print(f"After: {after_result['passed']}/{after_result['total']} passed")
    print(f"Improvement: {report['summary']['improvement']} additional tests passing")
    print(f"\nReport saved to: {report_path}")

    # Exit with 0 if after_result passes all tests (the fix works)
    # The before test is expected to fail (it has bugs)
    if after_result['success']:
        print("\n✅ Fix verified - all 27 tests pass in repository_after!")
        sys.exit(0)
    else:
        print("\n❌ Fix incomplete - repository_after still has failing tests")
        sys.exit(1)

if __name__ == '__main__':
    main()
