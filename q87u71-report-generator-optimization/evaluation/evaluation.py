#!/usr/bin/env python3
import sys
import re
import json
import uuid
import platform
import os
import subprocess
from pathlib import Path
from datetime import datetime

ROOT = Path("/app")  # Docker path
REPORTS = ROOT / "evaluation" / "reports"

def environment_info():
    return {
        "python_version": platform.python_version(),
        "platform": platform.platform()
    }

def run_tests(repo_name: str):
    """Run Maven tests for a specific repository."""
    pom_path = f"{repo_name}/pom.xml"
    
    try:
        proc = subprocess.run(
            ["mvn", "test", "-f", pom_path],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=300  # 5 minute timeout
        )
        
        output = proc.stdout + proc.stderr
        
        # Truncate if too long
        if len(output) > 20000:
            output = output[:4000] + "\n...[truncated]...\n" + output[-16000:]
            
        return {
            "passed": proc.returncode == 0,
            "return_code": proc.returncode,
            "output": output
        }
    except subprocess.TimeoutExpired:
        return {
            "passed": False,
            "return_code": -1,
            "output": "Maven test timeout (>300s)"
        }

def run_metrics(repo_path: Path):
    """Collect code metrics."""
    metrics = {
        "java_file_count": 0,
        "lines_of_code": 0,
        "class_count_approx": 0
    }
    
    if not repo_path.exists():
        return metrics

    try:
        for file_path in repo_path.rglob("*.java"):
            metrics["java_file_count"] += 1
            try:
                content = file_path.read_text(encoding="utf-8", errors="ignore")
                lines = content.splitlines()
                metrics["lines_of_code"] += len(lines)
                metrics["class_count_approx"] += sum(1 for line in lines if line.strip().startswith("public class ") or line.strip().startswith("class "))
            except Exception:
                pass
    except Exception as e:
        metrics["error"] = str(e)
        
    return metrics

def evaluate(repo_name: str):
    """Evaluate a repository."""
    repo_path = ROOT / repo_name
    
    tests = run_tests(repo_name)
    metrics = run_metrics(repo_path)
    return {
        "tests": tests,
        "metrics": metrics
    }

def parse_maven_output(output):
    """Parse Maven output to extract test results and performance data."""
    passed = 0
    failed = 0
    errors = 0
    
    # [INFO] Tests run: 11, Failures: 0, Errors: 0, Skipped: 0
    match = re.search(r"Tests run: (\d+), Failures: (\d+), Errors: (\d+), Skipped: (\d+)", output)
    if match:
        total_run = int(match.group(1))
        failed_count = int(match.group(2))
        errors_count = int(match.group(3))
        passed = total_run - failed_count - errors_count
    
    # Extract performance data from test output
    perf_match = re.search(r"Generation time for (\d+) transactions: (\d+)ms", output)
    performance = None
    if perf_match:
        transaction_count = int(perf_match.group(1))
        duration_ms = int(perf_match.group(2))
        performance = {
            "transaction_count": transaction_count,
            "duration_ms": duration_ms,
            "duration_seconds": duration_ms / 1000.0
        }
    
    total = passed + failed + errors
    coverage = passed
    
    return passed, failed + errors, coverage, total, performance

def run_evaluation():
    """Run full evaluation comparing before and after."""
    run_id = str(uuid.uuid4())
    start = datetime.utcnow()
    
    # Evaluate repository_before (baseline)
    before = evaluate("repository_before")
    
    # Evaluate repository_after (optimized)
    after = evaluate("repository_after")
    
    end = datetime.utcnow()
    
    comparison = {
        "passed_gate": after["tests"]["passed"],
        "improvement_summary": "Optimized code performance evaluation"
    }
    
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

def print_report(report, report_path):
    """Print evaluation report."""
    b_p, b_f, b_cov, b_tot, b_perf = parse_maven_output(report["before"]["tests"]["output"])
    a_p, a_f, a_cov, a_tot, a_perf = parse_maven_output(report["after"]["tests"]["output"])
    
    print("=" * 60)
    print("EVALUATION RESULTS")
    print("=" * 60)
    print()
    print(f"Run ID: {report['run_id']}")
    print(f"Duration: {report['duration_seconds']:.2f} seconds")
    print()
    
    print("BEFORE (repository_before):")
    print(f"  Tests passed: {report['before']['tests']['passed']}")
    print(f"  Passed: {b_p} | Failed: {b_f}")
    print(f"  Requirements covered: {b_cov}/{b_tot}")
    
    if b_perf:
        print()
        print("  PERFORMANCE:")
        print(f"    Transaction Count: {b_perf['transaction_count']:,}")
        print(f"    Generation Time: {b_perf['duration_ms']:,}ms ({b_perf['duration_seconds']:.2f}s)")
        if b_perf['duration_seconds'] >= 5.0:
            print(f"    ❌ FAILED: Exceeded 5 second requirement")
        else:
            print(f"    ✅ PASSED: < 5 second requirement")
    
    print()
    print("AFTER (repository_after):")
    print(f"  Tests passed: {report['after']['tests']['passed']}")
    print(f"  Passed: {a_p} | Failed: {a_f}")
    print(f"  Requirements covered: {a_cov}/{a_tot}")
    
    if a_perf:
        print()
        print("  PERFORMANCE:")
        print(f"    Transaction Count: {a_perf['transaction_count']:,}")
        print(f"    Generation Time: {a_perf['duration_ms']:,}ms ({a_perf['duration_seconds']:.2f}s)")
        
        if a_perf['duration_seconds'] < 5.0:
            print(f"    ✅ PASSED: < 5 second requirement")
        else:
            print(f"    ❌ FAILED: Exceeded 5 second requirement")
        
        # Show improvement if both have performance data
        if b_perf and b_perf['duration_ms'] > 0:
            speedup = b_perf['duration_ms'] / a_perf['duration_ms']
            print(f"    🚀 SPEEDUP: {speedup:.1f}x faster than baseline")
    
    print()
    print("COMPARISON:")
    print(f"  Passed gate: {report['comparison']['passed_gate']}")
    print(f"  Summary: {report['comparison']['improvement_summary']}")
    print()
    print("=" * 60)
    print(f"SUCCESS: {report['success']}")
    print("=" * 60)
    print()
    print(f"Report written to {report_path}")

def main():
    """Main entry point."""
    report = run_evaluation()
    
    # Generate report path
    now = datetime.strptime(report["started_at"].replace("Z", ""), "%Y-%m-%dT%H:%M:%S.%f")
    date_str = now.strftime("%Y-%m-%d")
    time_str = now.strftime("%H-%M-%S")
    
    report_dir = REPORTS / date_str / time_str
    report_dir.mkdir(parents=True, exist_ok=True)
    
    path = report_dir / "report.json"
    path.write_text(json.dumps(report, indent=2))
    
    print_report(report, path)
    return 0 if report["success"] else 1

if __name__ == "__main__":
    sys.exit(main())
