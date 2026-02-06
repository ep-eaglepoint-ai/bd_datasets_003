#!/usr/bin/env python3
"""
Evaluation script that runs pytest and generates comprehensive report.json
"""
import json
import subprocess
import sys
import uuid
from datetime import datetime
from pathlib import Path
import platform
import socket
import os

# Detect working directory (Docker uses /app, local uses current dir)
WORK_DIR = Path('/app') if Path('/app').exists() else Path.cwd()

def run_tests():
    """Run pytest and capture results in JSON format"""
    try:
        result = subprocess.run(
            ['python3', '-m', 'pytest', 'tests/', '-v', '--tb=short', '--json-report', '--json-report-file=test_results.json'],
            capture_output=True,
            text=True,
            cwd=str(WORK_DIR)
        )
        
        return result.returncode, result.stdout, result.stderr
    except Exception as e:
        print(f"Error running tests: {e}", file=sys.stderr)
        return 1, "", str(e)


def parse_pytest_output(stdout, stderr):
    """Parse pytest output to extract test results"""
    tests = []
    
    # Try to read JSON report if it exists
    json_report_path = WORK_DIR / 'test_results.json'
    if json_report_path.exists():
        try:
            with open(json_report_path, 'r') as f:
                pytest_json = json.load(f)
                
            for test in pytest_json.get('tests', []):
                test_name = test.get('nodeid', 'Unknown Test')
                # Clean up test name
                if '::' in test_name:
                    test_name = test_name.split('::')[-1]
                
                status = test.get('outcome', 'unknown')
                if status == 'passed':
                    status = 'passed'
                elif status == 'failed':
                    status = 'failed'
                elif status == 'skipped':
                    status = 'skipped'
                
                duration_ms = int(test.get('duration', 0) * 1000)  # Convert to ms
                
                failure_messages = []
                if status == 'failed' and 'call' in test:
                    longrepr = test['call'].get('longrepr', '')
                    if longrepr:
                        failure_messages.append(str(longrepr))
                
                tests.append({
                    'name': test_name,
                    'status': status,
                    'duration': duration_ms,
                    'failureMessages': failure_messages
                })
        except Exception as e:
            print(f"Warning: Could not parse JSON report: {e}", file=sys.stderr)
    
    # Fallback: parse from stdout
    if not tests:
        for line in stdout.split('\n'):
            if 'PASSED' in line or 'FAILED' in line or 'SKIPPED' in line:
                parts = line.split('::')
                if len(parts) >= 2:
                    test_name = parts[-1].split()[0]
                    status = 'passed' if 'PASSED' in line else 'failed' if 'FAILED' in line else 'skipped'
                    tests.append({
                        'name': test_name,
                        'status': status,
                        'duration': 0,
                        'failureMessages': []
                    })
    
    return tests


def generate_report(exit_code, stdout, stderr, start_time, end_time):
    """Generate the report.json in the required format"""
    
    tests = parse_pytest_output(stdout, stderr)
    
    # Calculate summary
    total = len(tests)
    passed = sum(1 for t in tests if t['status'] == 'passed')
    failed = sum(1 for t in tests if t['status'] == 'failed')
    skipped = sum(1 for t in tests if t['status'] == 'skipped')
    xfailed = 0  # pytest xfail not used in this project
    errors = 0 if exit_code == 0 else 1
    
    duration = (end_time - start_time).total_seconds()
    
    report = {
        'run_id': str(uuid.uuid4()),
        'started_at': start_time.isoformat() + 'Z',
        'finished_at': end_time.isoformat() + 'Z',
        'duration_seconds': round(duration, 3),
        'success': exit_code == 0 and failed == 0,
        'error': None if exit_code == 0 else stderr[:500] if stderr else 'Test execution failed',
        'environment': {
            'python_version': platform.python_version(),
            'platform': platform.system(),
            'os': platform.platform(),
            'architecture': platform.machine(),
            'hostname': socket.gethostname()
        },
        'results': {
            'after': {
                'success': exit_code == 0 and failed == 0,
                'exit_code': exit_code,
                'tests': tests,
                'summary': {
                    'total': total,
                    'passed': passed,
                    'failed': failed,
                    'xfailed': xfailed,
                    'errors': errors,
                    'skipped': skipped
                }
            }
        },
        'comparison': {
            'after_tests_passed': exit_code == 0 and failed == 0,
            'after_total': total,
            'after_passed': passed,
            'after_failed': failed,
            'after_xfailed': xfailed
        }
    }
    
    return report


def main():
    """Main evaluation function"""
    print("Starting test evaluation...")
    print("=" * 60)
    
    start_time = datetime.utcnow()
    
    # Run tests
    exit_code, stdout, stderr = run_tests()
    
    end_time = datetime.utcnow()
    
    # Print test output
    print(stdout)
    if stderr:
        print("STDERR:", stderr, file=sys.stderr)
    
    # Generate report
    report = generate_report(exit_code, stdout, stderr, start_time, end_time)
    
    # Create output directory with timestamp
    timestamp = datetime.now().strftime('%Y-%m-%d/%H-%M-%S')
    output_dir = WORK_DIR / 'evaluation' / timestamp
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Write report
    report_path = output_dir / 'report.json'
    with open(report_path, 'w') as f:
        json.dump(report, f, indent=2)
    
    print("=" * 60)
    print(f"Report generated: {report_path}")
    print(f"Tests: {report['results']['after']['summary']['total']}")
    print(f"Passed: {report['results']['after']['summary']['passed']}")
    print(f"Failed: {report['results']['after']['summary']['failed']}")
    print(f"Success: {report['success']}")
    print("=" * 60)
    
    # Exit with same code as tests
    sys.exit(0 if report['success'] else 1)


if __name__ == '__main__':
    main()

