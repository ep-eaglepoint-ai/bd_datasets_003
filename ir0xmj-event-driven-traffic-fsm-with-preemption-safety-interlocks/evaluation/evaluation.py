#!/usr/bin/env python3
"""
Evaluation runner for Event-Driven Traffic FSM with Preemption & Safety Interlocks.

This script runs all tests and generates a structured JSON report.
"""

import json
import os
import subprocess
import sys
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any


def get_timestamp() -> str:
    """Get current ISO timestamp."""
    return datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def parse_pytest_output(output: str) -> Dict[str, Any]:
    """Parse pytest verbose output to extract test results."""
    tests = []
    passed = 0
    failed = 0
    errors = 0
    skipped = 0
    
    lines = output.split('\n')
    
    for line in lines:
        line = line.strip()
        
        # Match pytest verbose output patterns
        if '::' in line and (' PASSED' in line or ' FAILED' in line or ' ERROR' in line or ' SKIPPED' in line):
            # Extract test name (nodeid)
            if ' PASSED' in line:
                nodeid = line.replace(' PASSED', '').strip()
                status = 'passed'
                passed += 1
            elif ' FAILED' in line:
                nodeid = line.replace(' FAILED', '').strip()
                status = 'failed'
                failed += 1
            elif ' ERROR' in line:
                nodeid = line.replace(' ERROR', '').strip()
                status = 'error'
                errors += 1
            elif ' SKIPPED' in line:
                nodeid = line.replace(' SKIPPED', '').strip()
                status = 'skipped'
                skipped += 1
            else:
                continue
                
            tests.append({
                'nodeid': nodeid,
                'status': status
            })
    
    return {
        'tests': tests,
        'passed': passed,
        'failed': failed,
        'errors': errors,
        'skipped': skipped,
        'total': passed + failed + errors + skipped
    }


def run_tests() -> Dict[str, Any]:
    """Run pytest and capture results."""
    try:
        result = subprocess.run(
            ['pytest', '-v', '--tb=short', 'tests/', '-p', 'no:cacheprovider'],
            capture_output=True,
            text=True,
            cwd='/app'
        )
        
        output = result.stdout + result.stderr
        parsed = parse_pytest_output(output)
        
        return {
            'exit_code': result.returncode,
            'output': output,
            'parsed': parsed
        }
    except Exception as e:
        return {
            'exit_code': 1,
            'output': str(e),
            'parsed': {
                'tests': [],
                'passed': 0,
                'failed': 0,
                'errors': 1,
                'skipped': 0,
                'total': 0
            }
        }


def create_report(run_id: str, start_time: str, end_time: str, 
                  duration: float, test_results: Dict[str, Any]) -> Dict[str, Any]:
    """Create the evaluation report."""
    parsed = test_results['parsed']
    overall_passed = parsed['failed'] == 0 and parsed['errors'] == 0
    
    report = {
        'run_id': run_id,
        'task_title': 'Event-Driven Traffic FSM with Preemption & Safety Interlocks',
        'start_time': start_time,
        'end_time': end_time,
        'duration_seconds': round(duration, 2),
        'test_results': {
            'total': parsed['total'],
            'passed': parsed['passed'],
            'failed': parsed['failed'],
            'errors': parsed['errors'],
            'skipped': parsed['skipped'],
            'tests': parsed['tests']
        },
        'overall_status': 'PASSED' if overall_passed else 'FAILED',
        'summary': {
            'success': overall_passed,
            'pass_rate': round(parsed['passed'] / max(parsed['total'], 1) * 100, 2)
        }
    }
    
    return report


def save_report(report: Dict[str, Any]) -> str:
    """Save the report to a JSON file."""
    now = datetime.utcnow()
    date_dir = now.strftime("%Y-%m-%d")
    time_dir = now.strftime("%H-%M-%S")
    
    report_dir = Path('/app/evaluation/reports') / date_dir / time_dir
    report_dir.mkdir(parents=True, exist_ok=True)
    
    report_path = report_dir / 'report.json'
    
    with open(report_path, 'w') as f:
        json.dump(report, f, indent=2)

    
    return str(report_path)


def print_evaluation_output(run_id: str, start_time: str, report: Dict[str, Any], 
                           report_path: str, duration: float):
    """Print the formatted evaluation output."""
    test_results = report['test_results']
    
    print(f"Run ID: {run_id}")
    print(f"Started at: {start_time}")
    print()
    print("=" * 60)
    print("EVENT-DRIVEN TRAFFIC FSM EVALUATION")
    print("=" * 60)
    print()
    print("=" * 60)
    print("RUNNING TESTS (REPOSITORY_AFTER)")
    print("=" * 60)
    print("Environment: repository_after")
    print("Tests directory: /app/tests")
    print()
    
    # Print individual test results
    for test in test_results['tests']:
        status_symbol = "✓ PASS" if test['status'] == 'passed' else "✗ FAIL"
        print(f"  [{status_symbol}] {test['nodeid']}")
    
    print()
    print(f"Results: {test_results['passed']} passed, {test_results['failed']} failed, "
          f"{test_results['errors']} errors, {test_results['skipped']} skipped "
          f"(total: {test_results['total']})")
    print()
    print("=" * 60)
    print("EVALUATION SUMMARY")
    print("=" * 60)
    print()
    print("Implementation (repository_after):")
    print(f"  Overall: {report['overall_status']}")
    print(f"  Tests: {test_results['passed']}/{test_results['total']} passed")
    print()
    print("=" * 60)
    print("EXPECTED BEHAVIOR CHECK")
    print("=" * 60)
    
    if report['overall_status'] == 'PASSED':
        print("[✓ OK] All tests passed (expected)")
    else:
        print("[✗ FAIL] Some tests failed")
    
    print()
    print(f"Report saved to:")
    print(f"{report_path}")
    print()
    print("=" * 60)
    print("EVALUATION COMPLETE")
    print("=" * 60)
    print(f"Run ID: {run_id}")
    print(f"Duration: {duration:.2f}s")
    print(f"Success: {'YES' if report['overall_status'] == 'PASSED' else 'NO'}")
    print()


def main():
    """Main evaluation entry point."""
    run_id = str(uuid.uuid4())
    start_time = get_timestamp()
    start_ts = datetime.utcnow()
    
    # Run tests
    test_results = run_tests()
    
    end_time = get_timestamp()
    end_ts = datetime.utcnow()
    duration = (end_ts - start_ts).total_seconds()
    
    # Create report
    report = create_report(run_id, start_time, end_time, duration, test_results)
    
    # Save report
    report_path = save_report(report)
    
    # Print output
    print_evaluation_output(run_id, start_time, report, report_path, duration)
    
    # Exit with appropriate code
    sys.exit(0 if report['overall_status'] == 'PASSED' else 1)


if __name__ == '__main__':
    main()
