#!/usr/bin/env python3
"""
Evaluation runner for Advanced Spectral Normalization System.
"""
import sys
import json
import uuid
import platform
import subprocess
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent.parent
REPORTS = ROOT / "evaluation" / "reports"


def environment_info():
    return {
        "python_version": platform.python_version(),
        "platform": platform.platform()
    }


def run_tests(repo_name: str):
    """Run pytest tests with the specified repository in PYTHONPATH."""
    repo_path = ROOT / repo_name
    tests_dir = ROOT / "tests"

    print(f"\n{'=' * 60}")
    print(f"RUNNING TESTS: {repo_name.upper()}")
    print(f"{'=' * 60}")
    print(f"PYTHONPATH: {repo_path}")
    print(f"Tests directory: {tests_dir}")

    env = dict(__import__('os').environ)
    env["PYTHONPATH"] = str(repo_path)

    try:
        proc = subprocess.run(
            [sys.executable, "-m", "pytest", str(tests_dir), "-q"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            env=env,
            timeout=300
        )
        output = (proc.stdout + proc.stderr)[-8000:]
        passed = proc.returncode == 0

        print(f"\nResults: {'PASSED' if passed else 'FAILED'}")

        return {
            "passed": passed,
            "return_code": proc.returncode,
            "output": output
        }
    except subprocess.TimeoutExpired:
        return {
            "passed": False,
            "return_code": -1,
            "output": "pytest timeout"
        }


def run_metrics(repo_path: Path):
    """Optional – trainers implement if needed."""
    return {}


def evaluate(repo_name: str):
    """Evaluate a single repository."""
    repo_path = ROOT / repo_name
    tests = run_tests(repo_name)
    metrics = run_metrics(repo_path)
    return {
        "tests": tests,
        "metrics": metrics
    }


def run_evaluation():
    """Run complete evaluation for both repositories."""
    print(f"\n{'=' * 60}")
    print("SPECTRAL NORMALIZATION EVALUATION")
    print(f"{'=' * 60}")

    run_id = str(uuid.uuid4())
    start = datetime.now(timezone.utc)

    before = evaluate("repository_before")
    after = evaluate("repository_after")

    passed_gate = after["tests"]["passed"]
    if passed_gate and not before["tests"]["passed"]:
        improvement_summary = "Repository after passes all correctness tests while repository before fails as expected."
    elif passed_gate:
        improvement_summary = "Repository after passes all correctness tests."
    else:
        improvement_summary = "Repository after failed correctness tests."

    comparison = {
        "passed_gate": passed_gate,
        "improvement_summary": improvement_summary
    }

    end = datetime.now(timezone.utc)

    print(f"\n{'=' * 60}")
    print("EVALUATION SUMMARY")
    print(f"{'=' * 60}")
    print(f"\nBefore Implementation (repository_before):")
    print(f"  Overall: {'PASSED' if before['tests']['passed'] else 'FAILED'}")
    print(f"\nAfter Implementation (repository_after):")
    print(f"  Overall: {'PASSED' if after['tests']['passed'] else 'FAILED'}")

    return {
        "run_id": run_id,
        "started_at": start.isoformat().replace("+00:00", "Z"),
        "finished_at": end.isoformat().replace("+00:00", "Z"),
        "duration_seconds": round((end - start).total_seconds(), 6),
        "environment": environment_info(),
        "before": before,
        "after": after,
        "comparison": comparison,
        "success": passed_gate,
        "error": None
    }


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Run spectral normalization evaluation")
    parser.add_argument("--output", type=str, default=None,
                        help="Output JSON file path")
    args = parser.parse_args()

    try:
        report = run_evaluation()
    except Exception as e:
        import traceback
        print(f"\nERROR: {str(e)}")
        traceback.print_exc()

        now = datetime.now(timezone.utc)
        report = {
            "run_id": str(uuid.uuid4()),
            "started_at": now.isoformat().replace("+00:00", "Z"),
            "finished_at": now.isoformat().replace("+00:00", "Z"),
            "duration_seconds": 0,
            "environment": environment_info(),
            "before": {"tests": {"passed": False, "return_code": -1, "output": str(e)}, "metrics": {}},
            "after": {"tests": {"passed": False, "return_code": -1, "output": str(e)}, "metrics": {}},
            "comparison": {"passed_gate": False, "improvement_summary": str(e)},
            "success": False,
            "error": str(e)
        }

    if args.output:
        path = Path(args.output)
    else:
        now = datetime.now()
        date_str = now.strftime("%Y-%m-%d")
        time_str = now.strftime("%H-%M-%S")
        output_dir = REPORTS / date_str / time_str
        output_dir.mkdir(parents=True, exist_ok=True)
        path = output_dir / "report.json"

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2))
    print(f"\nReport saved to: {path}")

    print(f"\n{'=' * 60}")
    print("EVALUATION COMPLETE")
    print(f"{'=' * 60}")
    print(f"Run ID: {report['run_id']}")
    print(f"Duration: {report['duration_seconds']:.2f}s")
    print(f"Success: {'YES' if report['success'] else 'NO'}")

    return 0 if report["success"] else 1


if __name__ == "__main__":
    sys.exit(main())
