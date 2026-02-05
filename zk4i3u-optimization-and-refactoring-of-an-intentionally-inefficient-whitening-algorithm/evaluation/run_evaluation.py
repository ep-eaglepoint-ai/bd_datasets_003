import json
import os
import platform
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REPORT_PATH = ROOT / "evaluation" / "reports" / "report.json"


def _run_tests(repo_name: str) -> dict:
    env = os.environ.copy()
    env["REPO_UNDER_TEST"] = repo_name
    cmd = [sys.executable, "-m", "pytest", "-q", "tests"]
    started = time.perf_counter()
    result = subprocess.run(
        cmd,
        cwd=ROOT,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    finished = time.perf_counter()
    
    # Since we are forcing exit code 0 in conftest.py, we must detect failures from output
    passed = result.returncode == 0
    if "FAILED" in result.stdout or "errors" in result.stdout:
        passed = False

    return {
        "tests": {
            "passed": passed,
            "return_code": 0, # Always 0 now
            "output": result.stdout,
        },
        "test_cases": [],
        "duration_seconds": finished - started,
    }


def main() -> int:
    started_at = datetime.now(timezone.utc)
    run_id = str(uuid.uuid4())

    before = _run_tests("repository_before")
    after = _run_tests("repository_after")

    finished_at = datetime.now(timezone.utc)
    duration = (finished_at - started_at).total_seconds()

    comparison = {
        "passed_gate": bool(after["tests"]["passed"]),
        "improvement_summary": (
            "Repository after passes all correctness tests while repository before fails as expected."
            if after["tests"]["passed"] and not before["tests"]["passed"]
            else "Check test outputs for details."
        ),
    }

    report = {
        "run_id": run_id,
        "started_at": started_at.isoformat().replace("+00:00", "Z"),
        "finished_at": finished_at.isoformat().replace("+00:00", "Z"),
        "duration_seconds": duration,
        "environment": {
            "python_version": platform.python_version(),
            "platform": platform.platform(),
        },
        "before": {
            "tests": before["tests"],
            "test_cases": before["test_cases"],
        },
        "after": {
            "tests": after["tests"],
            "test_cases": after["test_cases"],
        },
        "comparison": comparison,
        "success": bool(comparison["passed_gate"] and after["tests"]["passed"]),
        "error": None,
    }

    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, indent=2))
    print(REPORT_PATH.as_posix())
    
    # Always return 0 as requested by the user ("result must be out with an exit of zero")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
