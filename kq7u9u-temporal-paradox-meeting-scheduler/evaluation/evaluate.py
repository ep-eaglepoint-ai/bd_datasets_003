#!/usr/bin/env python3
"""
Updated evaluation script for ChronoLabs Temporal Paradox Meeting Scheduler
Generates report in the specified format
"""

import json
import sys
import asyncio
import uuid
import platform
import os
import subprocess
import re
import tempfile
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, Any

# Add repository_after to path
repo_after_path = Path(__file__).parent.parent / "repository_after"
sys.path.insert(0, str(repo_after_path))


def run_tests() -> Dict[str, Any]:
    """Run pytest tests and return results"""
    try:
        # Run pytest
        result = subprocess.run(
            ["python", "-m", "pytest", "tests/", "-v"],
            capture_output=True,
            text=True,
            cwd=Path(__file__).parent.parent
        )
        
        # Parse output to determine pass/fail
        passed = result.returncode == 0
        output = result.stdout + "\n" + result.stderr
        
        # Count tests
        test_count = 0
        passed_count = 0
        failed_count = 0
        
        lines = output.split('\n')
        for line in lines:
            if "passed" in line:
                # Lines like: "111 passed in 3.55s" or "5 passed, 2 failed in 0.12s"
                passed_match = re.search(r"(\d+)\s+passed", line)
                failed_match = re.search(r"(\d+)\s+failed", line)
                if passed_match:
                    passed_count = int(passed_match.group(1))
                if failed_match:
                    failed_count = int(failed_match.group(1))
                test_count = passed_count + failed_count
                if test_count > 0:
                    break
        
        return {
            "passed": passed,
            "return_code": result.returncode,
            "output": output[-5000:],  # Last 5000 chars
            "test_count": test_count,
            "passed_count": passed_count,
            "failed_count": failed_count
        }
    except Exception as e:
        return {
            "passed": False,
            "return_code": 1,
            "output": f"Error running tests: {str(e)}",
            "test_count": 0,
            "passed_count": 0,
            "failed_count": 0
        }


async def run_scheduler_scenarios() -> Dict[str, Any]:
    """Run key scheduler scenarios to test fixes"""
    try:
        from app.scheduler import TemporalScheduler
        from app.models import ScheduleRequest, Participant, HistoricalEvent, TimeReference
        from app.event_log import EventLog

        with tempfile.TemporaryDirectory() as tmp_dir:
            db_path = Path(tmp_dir) / "event_log.json"
            event_log = EventLog(str(db_path))
            event_log.clear_events()
            scheduler = TemporalScheduler(event_log)
        
            participants = [
                Participant(id="1", name="Test User", email="test@example.com")
            ]
        
            now = datetime.now().replace(hour=10, minute=0, second=0, microsecond=0)
        
        # Seed with test data
            event_log.add_event(HistoricalEvent(
                event_type=TimeReference.LAST_CANCELLATION,
                timestamp=now - timedelta(hours=2),
                metadata={"reason": "first"}
            ))
            event_log.add_event(HistoricalEvent(
                event_type=TimeReference.LAST_CANCELLATION,
                timestamp=now - timedelta(hours=1),
                metadata={"reason": "second"}
            ))
            event_log.add_event(HistoricalEvent(
                event_type=TimeReference.LAST_DEPLOYMENT,
                timestamp=now - timedelta(hours=1, minutes=30),
                metadata={"success": True, "version": "v2.0"}
            ))
        
            scenarios = [
                {
                    "name": "two_most_recent_cancellations",
                    "rule": "2 hours after earlier of two most recent cancellations",
                    "duration": 30
                },
                {
                    "name": "successful_deployment",
                    "rule": "exactly 1 hour after successful deployment",
                    "duration": 45
                },
                {
                    "name": "exactly_keyword",
                    "rule": "exactly 2 hours after last cancellation",
                    "duration": 60
                },
                {
                    "name": "between_latest",
                    "rule": "between 9 AM and 4 PM",
                    "duration": 60
                },
            ]
            
            results = {}
            all_passed = True
            
            def seed_events():
                event_log.clear_events()
                event_log.add_event(HistoricalEvent(
                    event_type=TimeReference.LAST_CANCELLATION,
                    timestamp=now - timedelta(hours=2),
                    metadata={"reason": "first"}
                ))
                event_log.add_event(HistoricalEvent(
                    event_type=TimeReference.LAST_CANCELLATION,
                    timestamp=now - timedelta(hours=1),
                    metadata={"reason": "second"}
                ))
                event_log.add_event(HistoricalEvent(
                    event_type=TimeReference.LAST_DEPLOYMENT,
                    timestamp=now - timedelta(hours=1, minutes=30),
                    metadata={"success": True, "version": "v2.0"}
                ))

            for scenario in scenarios:
                try:
                    seed_events()
                    request = ScheduleRequest(
                        duration_minutes=scenario["duration"],
                        participants=participants,
                        temporal_rule=scenario["rule"],
                        requested_at=now
                    )
                    
                    response, error = await scheduler.schedule_meeting(request)
                    passed = response is not None and error is None
                    results[scenario["name"]] = {
                        "passed": passed,
                        "error": error.error if error else None,
                        "details": error.details if error else None,
                        "constraint_violations": error.constraint_violations if error else None,
                        "temporal_conflicts": error.temporal_conflicts if error else None
                    }
                    all_passed = all_passed and passed
                except Exception as e:
                    results[scenario["name"]] = {
                        "passed": False,
                        "error": str(e)
                    }
                    all_passed = False
            
            return {
                "passed": all_passed,
                "scenario_results": results
            }
        
    except Exception as e:
        return {
            "passed": False,
            "scenario_results": {"error": str(e)}
        }


def generate_report() -> Dict[str, Any]:
    """Generate comprehensive evaluation report"""
    run_id = str(uuid.uuid4())
    started_at = datetime.utcnow().isoformat() + "Z"
    
    # Run tests
    test_results = run_tests()
    
    # Run async scheduler tests
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    scheduler_results = loop.run_until_complete(run_scheduler_scenarios())
    loop.close()
    
    finished_at = datetime.utcnow().isoformat() + "Z"
    duration = (datetime.fromisoformat(finished_at[:-1]) - 
                datetime.fromisoformat(started_at[:-1])).total_seconds()
    
    # Get environment info
    environment = {
        "python_version": platform.python_version(),
        "platform": platform.system(),
        "arch": platform.machine(),
        "cpus": os.cpu_count() or 1
    }
    
    # Create report
    report = {
        "run_id": run_id,
        "started_at": started_at,
        "finished_at": finished_at,
        "duration_seconds": duration,
        "environment": environment,
        "before": {
            "tests": {
                "passed": False,  # No before state in this context
                "return_code": 1,
                "output": "No before state available"
            },
            "metrics": {}
        },
        "after": {
            "tests": {
                "passed": test_results["passed"],
                "return_code": test_results["return_code"],
                "output": test_results["output"]
            },
            "metrics": {
                "test_count": test_results["test_count"],
                "passed_count": test_results["passed_count"],
                "failed_count": test_results["failed_count"],
                "scheduler_tests_passed": scheduler_results["passed"],
                "scheduler_scenarios": scheduler_results.get("scenario_results", {})
            }
        },
        "comparison": {
            "passed_gate": test_results["passed"] and scheduler_results["passed"],
            "improvement_summary": "Fixed: two most recent cancellations, latest time between, exactly keyword, metadata filtering"
        },
        "success": test_results["passed"] and scheduler_results["passed"],
        "error": None if (test_results["passed"] and scheduler_results["passed"]) else "Tests failed"
    }
    
    return report


def main():
    """Main evaluation function"""
    print("=" * 70)
    print("ChronoLabs Temporal Paradox Meeting Scheduler - Evaluation")
    print("=" * 70)
    
    report = generate_report()
    
    # Print summary
    print(f"\nEvaluation Summary:")
    print(f"  Run ID: {report['run_id']}")
    print(f"  Duration: {report['duration_seconds']:.2f} seconds")
    print(f"  Tests Passed: {report['after']['tests']['passed']}")
    print(f"  Test Count: {report['after']['metrics']['test_count']}")
    print(f"  Passed Tests: {report['after']['metrics']['passed_count']}")
    print(f"  Failed Tests: {report['after']['metrics']['failed_count']}")
    print(f"  Scheduler Tests Passed: {report['after']['metrics']['scheduler_tests_passed']}")
    print(f"  Overall Success: {report['success']}")
    
    if report['comparison']['improvement_summary']:
        print(f"\nImprovements: {report['comparison']['improvement_summary']}")
    
    # Print scheduler scenario results
    print("\nScheduler Scenario Results:")
    for scenario, result in report['after']['metrics']['scheduler_scenarios'].items():
        if isinstance(result, dict):
            passed = result.get('passed', False)
            error = result.get('error')
        else:
            passed = False
            error = str(result)

        status = "✓" if passed else "✗"
        print(f"  {status} {scenario}: {'PASS' if passed else 'FAIL'}")
        if error:
            print(f"    Error: {error[:100]}...")
        if isinstance(result, dict) and result.get('details'):
            print(f"    Details: {str(result['details'])[:120]}...")
        if isinstance(result, dict) and result.get('constraint_violations'):
            print(f"    Violations: {str(result['constraint_violations'])[:120]}...")
        if isinstance(result, dict) and result.get('temporal_conflicts'):
            print(f"    Conflicts: {str(result['temporal_conflicts'])[:120]}...")
    
    # Save report
    report_path = Path(__file__).parent / "reports" / "report.json"
    report_path.parent.mkdir(exist_ok=True)
    
    with open(report_path, 'w') as f:
        json.dump(report, f, indent=2)
    
    print(f"\nDetailed report saved to: {report_path}")
    print("=" * 70)
    
    # Return exit code
    sys.exit(0 if report['success'] else 1)


if __name__ == "__main__":
    main()