#!/usr/bin/env python3

from __future__ import annotations

import json
import os
import platform
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict


ROOT = Path(__file__).resolve().parent.parent
REPORTS_DIR = ROOT / "evaluation" / "reports"
REPORT_PATH = REPORTS_DIR / "report.json"


_UTC_OFFSET_SUFFIX = "+00:00"


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _iso_z(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat().replace(_UTC_OFFSET_SUFFIX, "Z")


def environment_info() -> Dict[str, str]:
    return {
        "python_version": platform.python_version(),
        "platform": platform.platform(),
    }


def _truncate(text: str, limit: int = 8000) -> str:
    if not text:
        return ""
    if len(text) <= limit:
        return text
    return text[:limit]


def run_tests(repo_name: str) -> Dict[str, Any]:
    env = os.environ.copy()
    env["EVAL_REPO"] = repo_name

    repo_path = ROOT / repo_name
    existing_pythonpath = env.get("PYTHONPATH", "")
    env["PYTHONPATH"] = str(repo_path) + (os.pathsep + existing_pythonpath if existing_pythonpath else "")

    try:
        proc = subprocess.run(
            [sys.executable, "-m", "pytest", "tests", "-q"],
            cwd=str(ROOT),
            capture_output=True,
            text=True,
            timeout=120,
            env=env,
        )
        output = _truncate((proc.stdout or "") + (proc.stderr or ""), 8000)
        return {
            "passed": proc.returncode == 0,
            "return_code": int(proc.returncode),
            "output": output,
        }
    except subprocess.TimeoutExpired:
        return {
            "passed": False,
            "return_code": -1,
            "output": "pytest timeout",
        }


def run_metrics(repo_path: Path) -> Dict[str, Any]:
    # Optional by standard; no task-specific metrics required.
    _ = repo_path
    return {}


def evaluate(repo_name: str) -> Dict[str, Any]:
    repo_path = ROOT / repo_name
    tests = run_tests(repo_name)
    metrics = run_metrics(repo_path)
    return {
        "tests": tests,
        "metrics": metrics,
    }


def _improvement_summary(before_tests: Dict[str, Any], after_tests: Dict[str, Any]) -> str:
    before_passed = bool(before_tests.get("passed"))
    after_passed = bool(after_tests.get("passed"))

    if after_passed and not before_passed:
        return "After implementation passed correctness tests; before failed."
    if after_passed and before_passed:
        return "Both before and after passed correctness tests."
    if (not after_passed) and before_passed:
        return "Before passed correctness tests; after failed."
    return "Both before and after failed correctness tests."


def run_evaluation() -> Dict[str, Any]:
    run_id = str(uuid.uuid4())
    started_at = _utc_now()
    start_time = time.perf_counter()

    before = evaluate("repository_before")
    after = evaluate("repository_after")

    finished_at = _utc_now()
    duration_seconds = time.perf_counter() - start_time

    comparison = {
        "passed_gate": bool(after["tests"]["passed"]),
        "improvement_summary": _improvement_summary(before["tests"], after["tests"]),
    }

    return {
        "run_id": run_id,
        "started_at": _iso_z(started_at),
        "finished_at": _iso_z(finished_at),
        "duration_seconds": float(duration_seconds),
        "environment": environment_info(),
        "before": before,
        "after": after,
        "comparison": comparison,
        "success": bool(comparison["passed_gate"]),
        "error": None,
    }


def _write_report(report: Dict[str, Any]) -> None:
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, indent=2, sort_keys=False), encoding="utf-8")


def main() -> int:
    try:
        report = run_evaluation()
    except Exception as exc:
        now = _utc_now()
        report = {
            "run_id": str(uuid.uuid4()),
            "started_at": _iso_z(now),
            "finished_at": _iso_z(now),
            "duration_seconds": 0.0,
            "environment": environment_info(),
            "before": {"tests": {"passed": False, "return_code": 1, "output": ""}, "metrics": {}},
            "after": {"tests": {"passed": False, "return_code": 1, "output": ""}, "metrics": {}},
            "comparison": {"passed_gate": False, "improvement_summary": "Evaluation runner errored."},
            "success": False,
            "error": f"{type(exc).__name__}: {exc}",
        }

    _write_report(report)
    return 0 if report.get("success") else 1


if __name__ == "__main__":
    sys.exit(main())
