#!/usr/bin/env python3
"""
Evaluation script for Django ORM Performance Fix Assessment
Runs tests against repository_before and repository_after, generates report.json
"""
import json
import subprocess
import sys
import uuid
from datetime import datetime
from pathlib import Path
import platform
import os

def run_tests(repository_dir, test_type, json_output_file):
    """Run pytest and capture results"""
    base_dir = Path(__file__).parent.parent
    repo_path = base_dir / repository_dir
    
    # Set environment for Django
    env = os.environ.copy()
    env['PYTHONPATH'] = str(repo_path)
    env['DJANGO_SETTINGS_MODULE'] = 'ecommerce.settings_test'
    
    cmd = [
        "python3", "-m", "pytest",
        str(base_dir / "tests/"),
        "-v",
        "--tb=short",
        "--json-report",
        f"--json-report-file={json_output_file}"
    ]
    
    print(f"\n{'='*60}")
    print(f"Running {test_type} tests...")
    print(f"Repository: {repository_dir}")
    print(f"Command: {' '.join(cmd)}")
    print(f"PYTHONPATH: {env['PYTHONPATH']}")
    print(f"{'='*60}\n")
    
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        env=env,
        cwd=str(repo_path)
    )
    
    print(result.stdout)
    if result.stderr:
        print(result.stderr, file=sys.stderr)
    
    return result

def parse_pytest_json(json_file):
    """Parse pytest JSON report"""
    if not Path(json_file).exists():
        return None
    
    with open(json_file, 'r') as f:
        data = json.load(f)
    
    tests = []
    summary = data.get('summary', {})
    
    for test_data in data.get('tests', []):
        # Extract test class and name from nodeid
        nodeid = test_data.get('nodeid', '')
        # Format: tests/test_file.py::TestClass::test_method or tests/test_file.py::test_function
        
        parts = nodeid.split('::')
        if len(parts) >= 2:
            test_class = parts[1] if len(parts) == 3 else parts[0].split('/')[-1].replace('.py', '')
            test_name = parts[-1]
        else:
            test_class = "Unknown"
            test_name = nodeid
        
        # Map pytest outcome to status
        outcome = test_data.get('outcome', 'unknown')
        status_map = {
            'passed': 'passed',
            'failed': 'failed',
            'skipped': 'skipped',
            'xfailed': 'xfailed',
            'xpassed': 'passed',
            'error': 'error'
        }
        status = status_map.get(outcome, outcome)
        
        tests.append({
            'class': test_class,
            'name': test_name,
            'status': status,
            'full_name': f"{test_class}::{test_name}"
        })
    
    return {
        'tests': tests,
        'summary': {
            'total': summary.get('total', 0),
            'passed': summary.get('passed', 0),
            'failed': summary.get('failed', 0),
            'xfailed': summary.get('xfailed', 0),
            'errors': summary.get('error', 0),
            'skipped': summary.get('skipped', 0)
        }
    }

def main():
    start_time = datetime.utcnow()
    run_id = str(uuid.uuid4())
    
    # Create output directory
    output_dir = Path(__file__).parent / datetime.now().strftime('%Y-%m-%d') / datetime.now().strftime('%H-%M-%S')
    output_dir.mkdir(parents=True, exist_ok=True)
    
    success = True
    error = None
    
    try:
        # Run tests on repository_before (expected to fail gracefully with xfail)
        print("\n" + "="*80)
        print("PHASE 1: Testing repository_before (unoptimized - expected to fail)")
        print("="*80)
        
        before_result = run_tests(
            "repository_before",
            "repository_before",
            "test_results_before.json"
        )
        
        # Run tests on repository_after (expected to pass)
        print("\n" + "="*80)
        print("PHASE 2: Testing repository_after (optimized - expected to pass)")
        print("="*80)
        
        after_result = run_tests(
            "repository_after",
            "repository_after",
            "test_results_after.json"
        )
        
        # Parse results
        before_data = parse_pytest_json("test_results_before.json")
        after_data = parse_pytest_json("test_results_after.json")
        
        if not before_data or not after_data:
            raise Exception("Failed to parse test results")
        
        # Build report
        end_time = datetime.utcnow()
        duration = (end_time - start_time).total_seconds()
        
        before_summary = before_data['summary']
        after_summary = after_data['summary']
        
        report = {
            "run_id": run_id,
            "started_at": start_time.isoformat() + "Z",
            "finished_at": end_time.isoformat() + "Z",
            "duration_seconds": round(duration, 3),
            "success": after_result.returncode == 0,
            "error": error,
            "environment": {
                "python_version": platform.python_version(),
                "platform": platform.system().lower(),
                "os": platform.platform(),
                "architecture": platform.machine(),
                "hostname": platform.node()
            },
            "results": {
                "before": {
                    "success": before_result.returncode == 0,
                    "exit_code": before_result.returncode,
                    "tests": before_data['tests'],
                    "summary": before_summary
                },
                "after": {
                    "success": after_result.returncode == 0,
                    "exit_code": after_result.returncode,
                    "tests": after_data['tests'],
                    "summary": after_summary
                },
                "comparison": {
                    "before_tests_passed": before_result.returncode == 0,
                    "after_tests_passed": after_result.returncode == 0,
                    "before_total": before_summary['total'],
                    "before_passed": before_summary['passed'],
                    "before_failed": before_summary['failed'],
                    "before_xfailed": before_summary['xfailed'],
                    "before_skipped": before_summary['skipped'],
                    "before_errors": before_summary['errors'],
                    "after_total": after_summary['total'],
                    "after_passed": after_summary['passed'],
                    "after_failed": after_summary['failed'],
                    "after_xfailed": after_summary['xfailed'],
                    "after_skipped": after_summary['skipped'],
                    "after_errors": after_summary['errors'],
                    "improvement": {
                        "tests_fixed": after_summary['passed'] - before_summary['passed'],
                        "features_added": after_summary['total'] - before_summary['total'] if after_summary['total'] > before_summary['total'] else 0
                    }
                }
            }
        }
        
        # Write report
        report_path = output_dir / "report.json"
        with open(report_path, 'w') as f:
            json.dump(report, f, indent=2)
        
        print("\n" + "="*80)
        print("EVALUATION COMPLETE")
        print("="*80)
        print(f"Report saved to: {report_path}")
        print(f"\nSummary:")
        print(f"  Repository Before: {before_summary['total']} tests, {before_summary['passed']} passed, {before_summary['failed']} failed")
        print(f"  Repository After:  {after_summary['total']} tests, {after_summary['passed']} passed, {after_summary['failed']} failed")
        print(f"  Improvement: {report['results']['comparison']['improvement']['tests_fixed']} tests fixed")
        print("="*80 + "\n")
        

        sys.exit(0)
        
    except Exception as e:
        error = str(e)
        success = False
        print(f"\nERROR: {error}", file=sys.stderr)
        sys.exit(0)

if __name__ == "__main__":
    main()
