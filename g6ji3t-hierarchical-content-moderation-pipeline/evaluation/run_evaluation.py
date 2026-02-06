from __future__ import annotations

import json
import os
import platform
import subprocess
import sys
import time
import uuid
from pathlib import Path


def iso_now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def env_info() -> dict:
    return {
        "python_version": platform.python_version(),
        "implementation": platform.python_implementation(),
        "platform": platform.system(),
        "platform_release": platform.release(),
        "machine": platform.machine(),
        "processor": platform.processor(),
        "cwd": str(Path.cwd()),
    }


def ensure_dir(p: Path) -> None:
    p.mkdir(parents=True, exist_ok=True)


def _truncate(s: str, limit: int = 4000) -> str:
    s = (s or "").strip()
    if len(s) <= limit:
        return s
    return s[:limit] + "\n... (truncated)"


def run_pytest(project_root: Path, pythonpath_dir: Path) -> dict:
    """
    Run pytest from the PROJECT ROOT (so it finds /tests),
    while switching PYTHONPATH to either repository_before or repository_after.
    """
    started_ms = int(time.time() * 1000)

    env = os.environ.copy()
    env["CI"] = "true"
    env["PYTHONPATH"] = str(pythonpath_dir)

    cmd = [sys.executable, "-m", "pytest", "-q"]

    proc = subprocess.run(
        cmd,
        cwd=str(project_root),
        env=env,
        capture_output=True,
        text=True,
    )

    finished_ms = int(time.time() * 1000)
    passed = proc.returncode == 0

    stdout = _truncate(proc.stdout)
    stderr = _truncate(proc.stderr)
    combined = _truncate((stderr + "\n" + stdout).strip())

    return {
        "passed": passed,
        "return_code": int(proc.returncode),
        "duration_ms": finished_ms - started_ms,
        "output": "All tests passed." if passed else (combined or "Tests failed."),
    }


def main() -> None:
    run_id = str(uuid.uuid4())
    started_at = iso_now()
    t0 = time.time()

    script_dir = Path(__file__).resolve().parent
    project_root = script_dir.parent  # /app

    repo_before = project_root / "repository_before"
    repo_after = project_root / "repository_after"

    report_dir = project_root / "evaluation" / "reports"
    ensure_dir(report_dir)
    report_path = report_dir / "report.json"

    error_msg: str | None = None

    if not repo_before.exists():
        error_msg = f"Missing repository_before at: {repo_before}"
    if not repo_after.exists():
        msg = f"Missing repository_after at: {repo_after}"
        error_msg = msg if error_msg is None else error_msg

    before_result = None
    after_result = None

    try:
        if error_msg is None:
            before_result = run_pytest(project_root, repo_before)
            after_result = run_pytest(project_root, repo_after)
    except Exception as e:
        error_msg = f"Evaluation runner error: {type(e).__name__}: {e}"

    finished_at = iso_now()
    t1 = time.time()

    success = bool(after_result and after_result.get("passed") is True and error_msg is None)

    report = {
        "run_id": run_id,
        "started_at": started_at,
        "finished_at": finished_at,
        "duration_seconds": round(t1 - t0, 3),
        "environment": env_info(),
        "tests": {
            "before": before_result,
            "after": after_result,
        },
        "success": success,
        "error": error_msg,
    }

    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print(f"Evaluation complete. Success: {success}")
    print(f"Report written to: {report_path}")

    raise SystemExit(0 if success else 1)


if __name__ == "__main__":
    main()
