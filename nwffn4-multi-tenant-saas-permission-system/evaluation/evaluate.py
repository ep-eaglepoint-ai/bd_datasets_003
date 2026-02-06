#!/usr/bin/env python3
import sys
import os
import json
import time
import uuid
import platform
import subprocess
from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).resolve().parent.parent
REPORTS = ROOT / "evaluation" / "reports"


def environment_info():
    return {
        "python_version": platform.python_version(),
        "platform": platform.platform()
    }


def run_tests(repo_name):
    repo_path = ROOT / repo_name
    print(f"\n{'='*60}")
    print(f"Running tests for {repo_name}")
    print(f"{'='*60}")
    
    try:
        proc = subprocess.run(
            [sys.executable, "-m", "pytest", "tests", "-v", "--tb=no", "-q", 
             "--create-db", "--nomigrations", "--ds=saas_platform.settings"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=120,
            env={**os.environ, 'PYTHONPATH': str(repo_path)}
        )
        
        output = proc.stdout + proc.stderr
        
        # Parse test results
        import re
        passed_match = re.search(r'(\d+) passed', output)
        failed_match = re.search(r'(\d+) failed', output)
        
        passed_count = int(passed_match.group(1)) if passed_match else 0
        failed_count = int(failed_match.group(1)) if failed_match else 0
        
        print(f"✓ Passed: {passed_count}")
        print(f"✗ Failed: {failed_count}")
        
        return {
            "passed": proc.returncode == 0,
            "return_code": proc.returncode,
            "passed_count": passed_count,
            "failed_count": failed_count,
            "output": output[:5000]
        }
    except subprocess.TimeoutExpired:
        print("✗ Tests timed out")
        return {
            "passed": False,
            "return_code": -1,
            "passed_count": 0,
            "failed_count": 0,
            "output": "pytest timeout"
        }
    except Exception as e:
        print(f"✗ Error: {str(e)}")
        return {
            "passed": False,
            "return_code": -1,
            "passed_count": 0,
            "failed_count": 0,
            "output": f"Error running tests: {str(e)}"
        }


def run_metrics(repo_name):
    metrics = {}
    repo_path = ROOT / repo_name
    
    try:
        sys.path.insert(0, str(repo_path))
        os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'saas_platform.settings')
        
        import django
        django.setup()
        
        from django.contrib.auth import get_user_model
        from accounts.models import Organization, Team, Project, OrganizationMember
        from permissions.services.permission_checker import permission_checker
        from django.core.cache import cache
        
        User = get_user_model()
        
        cache.clear()
        
        org = Organization.objects.create(name='Perf Test Org', slug='perf-test')
        team = Team.objects.create(organization=org, name='Perf Team', slug='perf-team')
        
        projects = []
        for i in range(100):
            projects.append(Project.objects.create(
                team=team,
                name=f'Project {i}',
                slug=f'project-{i}'
            ))
        
        user = User.objects.create_user(username='perfuser', password='pass')
        user.current_organization = org
        user.save()
        
        OrganizationMember.objects.create(organization=org, user=user, role='admin')
        
        times_uncached = []
        for i in range(10):
            cache.clear()
            start = time.perf_counter()
            permission_checker.check_permission(user, 'project', projects[i].id, 'read')
            end = time.perf_counter()
            times_uncached.append((end - start) * 1000)
        
        times_cached = []
        for i in range(10):
            start = time.perf_counter()
            permission_checker.check_permission(user, 'project', projects[i].id, 'read')
            end = time.perf_counter()
            times_cached.append((end - start) * 1000)
        
        project_ids = [p.id for p in projects]
        start = time.perf_counter()
        results = permission_checker.bulk_check_permissions(user, 'project', project_ids, 'read')
        end = time.perf_counter()
        bulk_time = (end - start) * 1000
        
        metrics = {
            "avg_uncached_ms": round(sum(times_uncached) / len(times_uncached), 2),
            "avg_cached_ms": round(sum(times_cached) / len(times_cached), 2),
            "bulk_check_100_ms": round(bulk_time, 2),
            "cache_speedup": round(sum(times_uncached) / sum(times_cached), 2) if sum(times_cached) > 0 else 0,
            "projects_tested": len(projects)
        }
        
        from django.db import connection
        connection.close()
        
    except Exception as e:
        metrics = {
            "error": str(e)
        }
    finally:
        if repo_path in sys.path:
            sys.path.remove(str(repo_path))
    
    return metrics


def evaluate(repo_name):
    tests = run_tests(repo_name)
    metrics = run_metrics(repo_name) if repo_name == "repository_after" else {}
    return {
        "tests": tests,
        "metrics": metrics
    }


def run_evaluation():
    run_id = str(uuid.uuid4())
    start = datetime.utcnow()
    
    print("\n" + "="*60)
    print("EVALUATION STARTED")
    print("="*60)
    
    before = evaluate("repository_before")
    after = evaluate("repository_after")
    
    print("\n" + "="*60)
    print("EVALUATION SUMMARY")
    print("="*60)
    
    print(f"\nBEFORE (repository_before):")
    print(f"  Passed: {before['tests'].get('passed_count', 0)} (expected: 11 PASS_TO_PASS)")
    print(f"  Failed: {before['tests'].get('failed_count', 0)} (expected: 12 FAIL_TO_PASS)")
    
    print(f"\nAFTER (repository_after):")
    print(f"  Passed: {after['tests'].get('passed_count', 0)} (expected: 23 all tests)")
    print(f"  Failed: {after['tests'].get('failed_count', 0)} (expected: 0)")
    
    # Calculate improvements
    fail_to_pass = after['tests'].get('passed_count', 0) - before['tests'].get('passed_count', 0)
    improvement_summary = f"Fixed {fail_to_pass} failing tests"
    
    if after["metrics"]:
        if "avg_cached_ms" in after["metrics"] and after["metrics"]["avg_cached_ms"] < 50:
            improvement_summary += f" with {after['metrics']['avg_cached_ms']}ms cached latency"
    
    comparison = {
        "passed_gate": after["tests"]["passed"],
        "improvement_summary": improvement_summary,
        "before_passed": before['tests'].get('passed_count', 0),
        "before_failed": before['tests'].get('failed_count', 0),
        "after_passed": after['tests'].get('passed_count', 0),
        "after_failed": after['tests'].get('failed_count', 0),
        "fail_to_pass_count": fail_to_pass
    }
    
    print(f"\nOVERALL STATUS: {'✓ PASSED' if comparison['passed_gate'] else '✗ FAILED'}")
    
    end = datetime.utcnow()
    
    return {
        "run_id": run_id,
        "started_at": start.isoformat() + "Z",
        "finished_at": end.isoformat() + "Z",
        "duration_seconds": (end - start).total_seconds(),
        "environment": environment_info(),
        "before": before,
        "after": after,
        "comparison": comparison,
        "success": comparison["passed_gate"],
        "error": None
    }


def main():
    REPORTS.mkdir(parents=True, exist_ok=True)
    
    try:
        report = run_evaluation()
    except Exception as e:
        report = {
            "run_id": str(uuid.uuid4()),
            "started_at": datetime.utcnow().isoformat() + "Z",
            "finished_at": datetime.utcnow().isoformat() + "Z",
            "duration_seconds": 0,
            "environment": environment_info(),
            "before": None,
            "after": None,
            "comparison": None,
            "success": False,
            "error": str(e)
        }
    
    path = REPORTS / "latest.json"
    path.write_text(json.dumps(report, indent=2))
    print(f"Report written to {path}")
    
    if report["success"]:
        print("\n✓ Evaluation PASSED")
    else:
        print("\n✗ Evaluation FAILED")
        if report.get("error"):
            print(f"Error: {report['error']}")
    
    return 0 if report["success"] else 1


if __name__ == "__main__":
    sys.exit(main())
