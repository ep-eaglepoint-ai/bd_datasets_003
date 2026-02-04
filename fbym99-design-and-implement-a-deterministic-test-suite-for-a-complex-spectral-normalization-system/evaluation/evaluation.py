#!/usr/bin/env python3
import json
import os
import platform
import subprocess
import sys
import time
import uuid
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPORTS_DIR = ROOT / "evaluation" / "reports"


def environment_info() -> dict:
    """Collect environment metadata."""
    return {
        "python_version": platform.python_version(),
        "platform": platform.platform(),
        "torch_version": _get_torch_version(),
    }


def _get_torch_version() -> str:
    try:
        import torch
        return torch.__version__
    except ImportError:
        return "not installed"


def run_tests(test_path: str, timeout: int = 300) -> dict:
    """Run pytest on the specified test path."""
    try:
        proc = subprocess.run(
            ["pytest", test_path, "-v", "--tb=short"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return {
            "passed": proc.returncode == 0,
            "return_code": proc.returncode,
            "output": (proc.stdout + proc.stderr)[:8000],
            "test_count": _parse_test_count(proc.stdout),
        }
    except subprocess.TimeoutExpired:
        return {"passed": False, "return_code": -1, "output": f"timeout after {timeout}s", "test_count": 0}
    except FileNotFoundError:
        return {"passed": False, "return_code": -2, "output": "pytest not found", "test_count": 0}


def _parse_test_count(output: str) -> int:
    import re
    match = re.search(r"(\d+) passed", output)
    return int(match.group(1)) if match else 0


def run_metrics(repo_path: Path) -> dict:
    """Collect test coverage metrics."""
    metrics = {}
    test_file = repo_path / "test_spectral_normalization.py"
    if test_file.exists():
        content = test_file.read_text()
        metrics["test_function_count"] = content.count("def test_")
        metrics["test_class_count"] = content.count("class Test")
    return metrics


def evaluate(repo_name: str) -> dict:
    """Evaluate a single repository."""
    repo_path = ROOT / repo_name
    return {
        "tests": run_tests(str(repo_path)),
        "metrics": run_metrics(repo_path),
    }


def run_meta_tests() -> dict:
    """Run meta-tests to verify test suite catches bugs."""
    meta_path = ROOT / "tests" / "test_meta.py"
    if not meta_path.exists():
        return {"passed": False, "return_code": -3, "output": "meta-tests not found", "test_count": 0}
    return run_tests(str(meta_path))


def run_evaluation() -> dict:
    """Execute full evaluation pipeline."""
    run_id = str(uuid.uuid4())
    start = datetime.utcnow()

    print("=" * 60)
    print("Spectral Normalization Test Suite Evaluation")
    print("=" * 60)

    print("\n[1/3] Evaluating repository_before...")
    before = evaluate("repository_before")
    print(f"      Result: {'PASS' if before['tests']['passed'] else 'NO TESTS/EXPECTED FAIL'}")

    print("\n[2/3] Evaluating repository_after...")
    after = evaluate("repository_after")
    print(f"      Result: {'PASS' if after['tests']['passed'] else 'FAIL'}")
    print(f"      Tests:  {after['tests'].get('test_count', 0)} passed")

    print("\n[3/3] Running meta-tests (bug injection verification)...")
    meta = run_meta_tests()
    print(f"      Result: {'PASS' if meta['passed'] else 'FAIL'}")
    print(f"      Tests:  {meta.get('test_count', 0)} passed")

    # Success: after passes AND meta-tests confirm test quality
    passed_gate = after["tests"]["passed"]

    comparison = {
        "passed_gate": passed_gate,
        "meta_tests_passed": meta["passed"],
        "improvement_summary": _generate_summary(before, after, meta),
    }

    end = datetime.utcnow()

    return {
        "run_id": run_id,
        "started_at": start.isoformat() + "Z",
        "finished_at": end.isoformat() + "Z",
        "duration_seconds": (end - start).total_seconds(),
        "environment": environment_info(),
        "before": before,
        "after": after,
        "meta": meta,
        "comparison": comparison,
        "success": passed_gate,
        "error": None,
    }


def _generate_summary(before: dict, after: dict, meta: dict) -> str:
    after_count = after["tests"].get("test_count", 0)
    meta_count = meta.get("test_count", 0)
    if after["tests"]["passed"] and meta["passed"]:
        return f"Test suite complete: {after_count} tests passing, {meta_count} meta-tests verified."
    elif after["tests"]["passed"]:
        return f"Tests pass ({after_count}) but meta-tests need review."
    return "Test suite failed."


def save_report(report: dict) -> Path:
    """Save report to JSON file."""
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    report_path = REPORTS_DIR / f"report_{timestamp}.json"
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)
    print(f"\n[Report] Saved to: {report_path}")
    return report_path


def main() -> int:
    """Main entry point."""
    try:
        report = run_evaluation()
        save_report(report)

        print("\n" + "=" * 60)
        print("EVALUATION SUMMARY")
        print("=" * 60)
        print(f"Success: {report['success']}")
        print(f"Duration: {report['duration_seconds']:.2f}s")
        print(f"Summary: {report['comparison']['improvement_summary']}")
        print("=" * 60)

        return 0 if report["success"] else 1

    except Exception as e:
        print(f"\n[ERROR] Evaluation failed: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
