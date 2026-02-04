#!/usr/bin/env python3
"""
Evaluation Script for Elastic Net Regressor Optimization

This script runs tests for both BEFORE and AFTER versions and generates
a comprehensive JSON report with test results and performance metrics.
"""

import subprocess
import json
import sys
import os
from datetime import datetime


def run_pytest(version):
    """Run pytest for a specific version and capture results."""
    print(f"\n{'='*70}")
    print(f"Running tests for {version.upper()} version...")
    print(f"{'='*70}\n")
    
    env = os.environ.copy()
    env['TEST_VERSION'] = version
    
    # Run pytest with JSON report
    cmd = [
        'pytest',
        '-v',
        '--tb=short',
        '--json-report',
        f'--json-report-file=evaluation/report_{version}.json',
        'tests/test_optimization.py'
    ]
    
    result = subprocess.run(
        cmd,
        env=env,
        capture_output=True,
        text=True
    )
    
    return {
        'exit_code': result.returncode,
        'stdout': result.stdout,
        'stderr': result.stderr
    }


def parse_test_results(version):
    """Parse pytest results from JSON report."""
    report_file = f'evaluation/report_{version}.json'
    
    if not os.path.exists(report_file):
        return None
    
    try:
        with open(report_file, 'r') as f:
            data = json.load(f)
        
        # Extract key metrics
        summary = data.get('summary', {})
        tests = data.get('tests', [])
        
        passed = []
        failed = []
        
        for test in tests:
            test_name = test.get('nodeid', '').split('::')[-1]
            outcome = test.get('outcome', 'unknown')
            duration = test.get('call', {}).get('duration', 0)
            
            test_info = {
                'name': test_name,
                'outcome': outcome,
                'duration': duration
            }
            
            if outcome == 'passed':
                passed.append(test_info)
            elif outcome == 'failed':
                test_info['message'] = test.get('call', {}).get('longrepr', '')
                failed.append(test_info)
        
        return {
            'total': summary.get('total', 0),
            'passed': len(passed),
            'failed': len(failed),
            'duration': data.get('duration', 0),
            'passed_tests': passed,
            'failed_tests': failed
        }
    except Exception as e:
        print(f"Error parsing {report_file}: {e}")
        return None


def generate_final_report(before_results, after_results):
    """Generate final comprehensive JSON report."""
    
    report = {
        'evaluation_timestamp': datetime.now().isoformat(),
        'project': 'Elastic Net Regressor Optimization',
        'versions': {
            'before': {
                'description': 'Unoptimized version with Python loops',
                'test_results': before_results
            },
            'after': {
                'description': 'Optimized version with NumPy vectorization',
                'test_results': after_results
            }
        },
        'comparison': {},
        'requirements_status': {}
    }
    
    # Calculate comparison metrics
    if before_results and after_results:
        before_duration = before_results.get('duration', 0)
        after_duration = after_results.get('duration', 0)
        
        speedup = before_duration / after_duration if after_duration > 0 else 0
        
        report['comparison'] = {
            'speedup': round(speedup, 2),
            'before_duration': round(before_duration, 3),
            'after_duration': round(after_duration, 3),
            'before_passed': before_results.get('passed', 0),
            'before_failed': before_results.get('failed', 0),
            'after_passed': after_results.get('passed', 0),
            'after_failed': after_results.get('failed', 0)
        }
        
        # Determine requirements status
        requirements = {
            'Predictions': 'preservation',
            'Training curves': 'preservation',
            'Performance speedup': 'optimization',
            'No Python loops': 'optimization',
            'Vectorization': 'optimization',
            'Minimal copies': 'optimization',
            'Memory efficient': 'preservation',
            'LR schedule': 'preservation',
            'Early stopping': 'preservation',
            'Standardization': 'preservation',
            'MSE loss': 'preservation',
            'Huber loss': 'preservation',
            'Elastic Net': 'preservation'
        }
        
        for req_name, req_type in requirements.items():
            # Check if requirement passed in AFTER version
            after_passed_names = [t['name'] for t in after_results.get('passed_tests', [])]
            
            # Robust matching: replace spaces with underscores and check for inclusion
            req_key = req_name.lower().replace(' ', '_')
            status = 'PASS' if any(req_key in name.lower() for name in after_passed_names) else 'FAIL'
            
            report['requirements_status'][req_name] = {
                'type': req_type,
                'status': status
            }
        
        # Overall status
        all_after_passed = after_results.get('failed', 0) == 0
        all_reqs_passed = all(r['status'] == 'PASS' for r in report['requirements_status'].values())
        optimization_improved = (
            before_results.get('failed', 0) > after_results.get('failed', 0)
        )
        
        report['overall_status'] = {
            'all_tests_passed': all_after_passed,
            'all_requirements_met': all_reqs_passed,
            'optimization_improved': optimization_improved,
            'speedup_achieved': speedup >= 1.5,
            'status': 'SUCCESS' if (all_after_passed and optimization_improved and all_reqs_passed) else 'PARTIAL'
        }
    
    # Save final report
    output_file = 'evaluation/evaluation.report.json'
    with open(output_file, 'w') as f:
        json.dump(report, f, indent=2)
    
    # Clean up intermediate reports
    for version in ['before', 'after']:
        temp_report = f'evaluation/report_{version}.json'
        if os.path.exists(temp_report):
            os.remove(temp_report)
    
    print(f"\n{'='*70}")
    print(f"Final report saved to: {output_file}")
    print(f"{'='*70}\n")
    
    return report


def print_summary(report):
    """Print a human-readable summary of the evaluation."""
    print("\n" + "="*70)
    print("EVALUATION SUMMARY")
    print("="*70 + "\n")
    
    comparison = report.get('comparison', {})
    overall = report.get('overall_status', {})
    
    print(f" Test Results:")
    print(f"   BEFORE: {comparison.get('before_passed', 0)} passed, {comparison.get('before_failed', 0)} failed")
    print(f"   AFTER:  {comparison.get('after_passed', 0)} passed, {comparison.get('after_failed', 0)} failed")
    
    print(f"\n Performance:")
    print(f"   BEFORE: {comparison.get('before_duration', 0):.3f}s")
    print(f"   AFTER:  {comparison.get('after_duration', 0):.3f}s")
    print(f"   SPEEDUP: {comparison.get('speedup', 0):.2f}x")
    
    print(f"\n Requirements Status:")
    requirements = report.get('requirements_status', {})
    preservation_pass = sum(1 for r in requirements.values() if r['type'] == 'preservation' and r['status'] == 'PASS')
    optimization_pass = sum(1 for r in requirements.values() if r['type'] == 'optimization' and r['status'] == 'PASS')
    
    print(f" Preservation: {preservation_pass}/9 passed")
    print(f" Optimization: {optimization_pass}/4 passed")
    
    print(f"\n Overall Status: {overall.get('status', 'UNKNOWN')}")
    
    if overall.get('status') == 'SUCCESS':
        print("\n All requirements met! Optimization successful!")
    else:
        print("\n  Some requirements not met. Review the detailed report.")
    
    print("\n" + "="*70 + "\n")


def main():
    """Main evaluation function."""
    print("\n" + "="*70)
    print("ELASTIC NET REGRESSOR OPTIMIZATION EVALUATION")
    print("="*70 + "\n")
    
    # Create evaluation directory if it doesn't exist
    os.makedirs('evaluation', exist_ok=True)
    
    # Run tests for BEFORE version
    before_run = run_pytest('before')
    before_results = parse_test_results('before')
    
    # Run tests for AFTER version
    after_run = run_pytest('after')
    after_results = parse_test_results('after')
    
    # Generate final report
    report = generate_final_report(before_results, after_results)
    
    # Print summary
    print_summary(report)
    
    # Exit with appropriate code
    if report.get('overall_status', {}).get('status') == 'SUCCESS':
        sys.exit(0)
    else:
        sys.exit(1)


if __name__ == '__main__':
    main()
