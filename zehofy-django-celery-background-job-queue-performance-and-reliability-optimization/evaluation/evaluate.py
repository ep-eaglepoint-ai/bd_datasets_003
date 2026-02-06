#!/usr/bin/env python3
"""
Evaluation script for Django Celery Background Job Queue Performance and Reliability Optimization.

This script runs tests and generates a JSON report comparing the before and after implementations.
"""
import os
import sys
import json
import subprocess
import time
from datetime import datetime
from typing import Dict, Any, List

# Add paths
REPO_BEFORE = os.path.join(os.path.dirname(__file__), '..', 'repository_before')
REPO_AFTER = os.path.join(os.path.dirname(__file__), '..', 'repository_after')
TESTS_DIR = os.path.join(os.path.dirname(__file__), '..', 'tests')


class EvaluationReport:
    """Generate and manage evaluation reports."""
    
    def __init__(self):
        self.results = {
            'timestamp': datetime.now().isoformat(),
            'instance_id': 'ZEHOFY',
            'tests': [],
            'metrics': {},
            'summary': {
                'passed': 0,
                'failed': 0,
                'total': 0
            }
        }
    
    def add_test_result(self, test_name: str, category: str, passed: bool, 
                        details: str = "", execution_time: float = 0.0):
        """Add a test result to the report."""
        result = {
            'name': test_name,
            'category': category,
            'passed': passed,
            'details': details,
            'execution_time': execution_time
        }
        self.results['tests'].append(result)
        
        if passed:
            self.results['summary']['passed'] += 1
        else:
            self.results['summary']['failed'] += 1
        self.results['summary']['total'] += 1
    
    def add_metric(self, metric_name: str, value: Any, unit: str = ""):
        """Add a performance metric."""
        self.results['metrics'][metric_name] = {
            'value': value,
            'unit': unit
        }
    
    def save_report(self, filename: str = 'evaluation_report.json'):
        """Save the report to a JSON file."""
        report_dir = os.path.dirname(__file__)
        # Create evaluation directory if it doesn't exist
        os.makedirs(report_dir, exist_ok=True)
        report_path = os.path.join(report_dir, filename)
        with open(report_path, 'w') as f:
            json.dump(self.results, f, indent=2)
        print(f"Report saved to {report_path}")
        return report_path
    
    def print_summary(self):
        """Print a summary of the evaluation."""
        print("\n" + "="*60)
        print("EVALUATION SUMMARY")
        print("="*60)
        print(f"Instance: {self.results['instance_id']}")
        print(f"Timestamp: {self.results['timestamp']}")
        print(f"Tests Passed: {self.results['summary']['passed']}")
        print(f"Tests Failed: {self.results['summary']['failed']}")
        print(f"Total Tests: {self.results['summary']['total']}")
        
        if self.results['summary']['total'] > 0:
            pass_rate = (self.results['summary']['passed'] / 
                        self.results['summary']['total'] * 100)
            print(f"Pass Rate: {pass_rate:.1f}%")
        
        print("\nMetrics:")
        for metric, data in self.results['metrics'].items():
            unit = data.get('unit', '')
            print(f"  - {metric}: {data['value']} {unit}")
        
        print("="*60)


def run_pytest(test_file: str, description: str) -> tuple[bool, float, str]:
    """
    Run pytest on a test file.
    
    Returns:
        Tuple of (success, execution_time, output)
    """
    test_path = os.path.join(TESTS_DIR, test_file)
    
    if not os.path.exists(test_path):
        return False, 0.0, f"Test file not found: {test_path}"
    
    start_time = time.time()
    
    # Set PYTHONPATH to include repository_after
    env = os.environ.copy()
    python_path = env.get('PYTHONPATH', '')
    if python_path:
        env['PYTHONPATH'] = f"{REPO_AFTER}:{python_path}"
    else:
        env['PYTHONPATH'] = REPO_AFTER
    
    try:
        result = subprocess.run(
            [sys.executable, '-m', 'pytest', test_path, '-v', '--tb=short'],
            capture_output=True,
            text=True,
            timeout=120,
            env=env
        )
        
        execution_time = time.time() - start_time
        success = result.returncode == 0
        
        output = result.stdout + result.stderr
        
        return success, execution_time, output
        
    except subprocess.TimeoutExpired:
        execution_time = time.time() - start_time
        return False, execution_time, "Test execution timed out"
    
    except Exception as e:
        execution_time = time.time() - start_time
        return False, execution_time, str(e)


def verify_repository_structure() -> Dict[str, bool]:
    """Verify that repository structure is correct."""
    results = {}
    
    # Check repository_after structure
    after_files = [
        'config/celery.py',
        'config/settings.py',
        'apps/tasks/email_tasks.py',
        'apps/tasks/import_tasks.py',
        'apps/tasks/notification_tasks.py',
        'apps/tasks/report_tasks.py',
        'apps/tasks/utils.py',
        'apps/notifications/models.py',
        'apps/reports/models.py',
    ]
    
    for file_path in after_files:
        full_path = os.path.join(REPO_AFTER, file_path)
        exists = os.path.exists(full_path)
        results[f'after:{file_path}'] = exists
    
    # Check tests
    test_files = [
        'test_idempotency.py',
        'test_retry_behavior.py',
        'test_queue_routing.py',
        'test_memory_bounded.py',
        'test_progress_tracking.py',
        'test_rate_limiting.py',
        'conftest.py',
    ]
    
    for test_file in test_files:
        full_path = os.path.join(TESTS_DIR, test_file)
        exists = os.path.exists(full_path)
        results[f'test:{test_file}'] = exists
    
    return results


def evaluate_celery_settings(report: EvaluationReport):
    """Evaluate Celery configuration settings."""
    print("\nEvaluating Celery settings...")
    
    try:
        sys.path.insert(0, REPO_AFTER)
        os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
        
        # Import Django settings
        from django.conf import settings
        
        # Check priority queues
        priority_checks = []
        
        # Check priority queue
        if hasattr(settings, 'CELERY_TASK_QUEUES'):
            # Handle both list of Queue objects and list of dicts
            try:
                queue_names = [q.name for q in settings.CELERY_TASK_QUEUES]
            except AttributeError:
                # Queue is a dict, use 'name' key
                queue_names = [q['name'] for q in settings.CELERY_TASK_QUEUES]
            
            if 'priority' in queue_names:
                priority_checks.append(("Priority queue exists", True))
            else:
                priority_checks.append(("Priority queue exists", False))
            
            if 'bulk' in queue_names:
                priority_checks.append(("Bulk queue exists", True))
            else:
                priority_checks.append(("Bulk queue exists", False))
        else:
            priority_checks.append(("Priority queue exists", False))
            priority_checks.append(("Bulk queue exists", False))
        
        # Check acks_late
        if hasattr(settings, 'CELERY_TASK_ACKS_LATE'):
            priority_checks.append(("ACKs late enabled", settings.CELERY_TASK_ACKS_LATE))
        
        # Check prefetch multiplier
        if hasattr(settings, 'CELERY_WORKER_PREFETCH_MULTIPLIER'):
            prefetch_ok = settings.CELERY_WORKER_PREFETCH_MULTIPLIER == 1
            priority_checks.append(("Prefetch multiplier = 1", prefetch_ok))
        
        # Check exponential backoff
        if hasattr(settings, 'CELERY_TASK_EXP_BACKOFF'):
            priority_checks.append(("Exponential backoff", settings.CELERY_TASK_EXP_BACKOFF))
        
        # Check jitter
        if hasattr(settings, 'CELERY_TASK_BACKOFF_JITTER'):
            priority_checks.append(("Retry jitter", settings.CELERY_TASK_BACKOFF_JITTER))
        
        # Check result expiration
        if hasattr(settings, 'CELERY_RESULT_EXPIRES'):
            priority_checks.append(("Result expiration", settings.CELERY_RESULT_EXPIRES > 0))
        
        # Report results
        for check_name, passed in priority_checks:
            report.add_test_result(
                check_name,
                'celery_settings',
                passed,
                f"{'PASS' if passed else 'FAIL'}: {check_name}"
            )
    
    except Exception as e:
        report.add_test_result(
            'celery_settings_evaluation',
            'celery_settings',
            False,
            str(e)
        )


def evaluate_task_implementations(report: EvaluationReport):
    """Evaluate task implementations."""
    print("\nEvaluating task implementations...")
    
    task_checks = []
    
    try:
        sys.path.insert(0, REPO_AFTER)
        
        # Import utilities first
        from apps.tasks import utils
        
        # Import task modules
        from apps.tasks import email_tasks, import_tasks, notification_tasks, report_tasks
        
        # Check email tasks have retry configuration
        if hasattr(email_tasks.send_welcome_email, 'max_retries'):
            task_checks.append(("Email task retry config", True))
        else:
            task_checks.append(("Email task retry config", False))
        
        # Check notification tasks have rate limiting (check in utils since it's imported there)
        if hasattr(utils, 'PUSH_NOTIFICATION_LIMITER'):
            task_checks.append(("Notification rate limiting", True))
        else:
            task_checks.append(("Notification rate limiting", False))
        
        # Check import tasks have bulk operations (check for bulk_create method usage)
        if hasattr(import_tasks, 'import_products_from_csv'):
            # Check if bulk_create is used in the function source
            import inspect
            source = inspect.getsource(import_tasks.import_products_from_csv)
            if 'bulk_create' in source:
                task_checks.append(("Import bulk operations", True))
            else:
                task_checks.append(("Import bulk operations", False))
        else:
            task_checks.append(("Import bulk operations", False))
        
        # Check utilities exist
        if hasattr(utils, 'generate_idempotency_key'):
            task_checks.append(("Idempotency utilities", True))
        else:
            task_checks.append(("Idempotency utilities", False))
        
        if hasattr(utils, 'ProgressTracker'):
            task_checks.append(("Progress tracker", True))
        else:
            task_checks.append(("Progress tracker", False))
        
        if hasattr(utils, 'TokenBucketRateLimiter'):
            task_checks.append(("Rate limiter", True))
        else:
            task_checks.append(("Rate limiter", False))
        
        for check_name, passed in task_checks:
            report.add_test_result(
                check_name,
                'task_implementations',
                passed,
                f"{'PASS' if passed else 'FAIL'}: {check_name}"
            )
    
    except Exception as e:
        report.add_test_result(
            'task_implementation_evaluation',
            'task_implementations',
            False,
            str(e)
        )


def run_tests(report: EvaluationReport):
    """Run pytest on test files."""
    print("\nRunning tests...")
    
    test_files = [
        ('test_idempotency.py', 'Idempotency Tests'),
        ('test_retry_behavior.py', 'Retry Behavior Tests'),
        ('test_queue_routing.py', 'Queue Routing Tests'),
        ('test_memory_bounded.py', 'Memory Bounded Tests'),
        ('test_progress_tracking.py', 'Progress Tracking Tests'),
        ('test_rate_limiting.py', 'Rate Limiting Tests'),
    ]
    
    for test_file, description in test_files:
        print(f"  Running {test_file}...")
        passed, exec_time, output = run_pytest(test_file, description)
        
        # Count passed/failed from output
        lines = output.split('\n')
        passed_count = 0
        failed_count = 0
        
        for line in lines:
            if 'passed' in line.lower() and 'failed' in line.lower():
                # Parse pytest summary
                try:
                    parts = line.split()
                    for i, part in enumerate(parts):
                        if part == 'passed':
                            passed_count = int(parts[i-1]) if parts[i-1].isdigit() else 0
                        if part == 'failed':
                            failed_count = int(parts[i-1]) if parts[i-1].isdigit() else 0
                except:
                    pass
        
        report.add_test_result(
            test_file,
            'pytest',
            passed,
            f"Passed: {passed_count}, Failed: {failed_count}",
            exec_time
        )


def main():
    """Main evaluation function."""
    print("="*60)
    print("ZEHOFY Django Celery Performance Optimization Evaluation")
    print("="*60)
    
    report = EvaluationReport()
    
    # Verify structure
    print("\n1. Verifying repository structure...")
    structure_results = verify_repository_structure()
    for check, passed in structure_results.items():
        report.add_test_result(
            f"structure:{check}",
            'repository_structure',
            passed,
            f"{'PASS' if passed else 'FAIL'}: {check}"
        )
    
    # Evaluate settings
    evaluate_celery_settings(report)
    
    # Evaluate task implementations
    evaluate_task_implementations(report)
    
    # Run tests
    run_tests(report)
    
    # Add performance metrics
    report.add_metric('tests_pass_rate', 
                     f"{report.results['summary']['passed']}/{report.results['summary']['total']}",
                     'ratio')
    
    # Print and save report
    report.print_summary()
    report.save_report()
    
    # Return exit code based on results
    if report.results['summary']['failed'] > 0:
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
