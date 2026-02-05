"""
Evaluation script: runs pytest against repository_after only,
parses JSON report, produces report.json.
"""

import json
import os
import platform
import random
import string
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path


def get_root_dir():
    """Resolve project root (parent of evaluation/ and tests/)."""
    cwd = Path.cwd().resolve()
    name = cwd.name
    if name in ("evaluation", "tests"):
        return cwd.parent
    return cwd


def get_git_info():
    commit = "unknown"
    branch = "unknown"
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if out.returncode == 0 and out.stdout:
            commit = out.stdout.strip()
    except Exception:
        pass
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if out.returncode == 0 and out.stdout:
            branch = out.stdout.strip()
    except Exception:
        pass
    return commit, branch


def get_environment():
    commit, branch = get_git_info()
    arch = platform.machine().lower()
    if arch == "x86_64":
        arch = "amd64"
    return {
        "python_version": platform.python_version(),
        "platform": platform.platform().lower(),
        "os": platform.system().lower(),
        "os_release": platform.release(),
        "architecture": arch,
        "hostname": platform.node(),
        "git_commit": commit,
        "git_branch": branch,
    }


def run_pytest(root_dir: Path, report_file: Path):
    """Run pytest against repository_after (no REPO_PATH needed); return (TestResults, stdout, stderr)."""
    env = os.environ.copy()
    report_path_str = str(Path(report_file).resolve())
    cmd = [
        sys.executable,
        "-m",
        "pytest",
        "tests",
        "-v",
        "--json-report",
        f"--json-report-file={report_path_str}",
        "--json-report-indent=2",
    ]
    proc = subprocess.run(
        cmd,
        cwd=str(root_dir),
        env=env,
        capture_output=True,
        text=True,
        timeout=300,
    )
    stdout = proc.stdout or ""
    stderr = proc.stderr or ""

    tests_list = []
    summary = {"total": 0, "passed": 0, "failed": 0, "errors": 0, "skipped": 0}
    report_path = Path(report_file).resolve()
    if report_path.exists():
        try:
            with open(report_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            tests_data = data.get("tests") or data.get("report", {}).get("tests") or []
            for t in tests_data:
                nodeid = t.get("nodeid", t.get("name", ""))
                outcome = t.get("outcome", "unknown")
                if outcome == "passed":
                    outcome = "passed"
                elif outcome == "failed":
                    outcome = "failed"
                elif outcome == "skipped":
                    outcome = "skipped"
                else:
                    outcome = "failed" if outcome != "passed" else "passed"
                name = nodeid.split("::")[-1] if "::" in nodeid else nodeid
                tests_list.append({"nodeid": nodeid, "name": name, "outcome": outcome})
                summary["total"] += 1
                if outcome == "passed":
                    summary["passed"] += 1
                elif outcome == "failed":
                    summary["failed"] += 1
                elif outcome == "skipped":
                    summary["skipped"] += 1
                else:
                    summary["errors"] += 1
        except Exception as e:
            stderr += f"\nFailed to parse report: {e}"
            summary["errors"] = 1
            summary["total"] = 1

    if summary["total"] == 0 and proc.returncode != 0:
        summary["errors"] = 1
        summary["total"] = 1

    success = (
        proc.returncode == 0
        and summary["failed"] == 0
        and summary.get("errors", 0) == 0
    )
    exit_code = proc.returncode if proc.returncode is not None else 1
    if not success and exit_code == 0:
        exit_code = 1

    return {
        "success": success,
        "exit_code": exit_code,
        "tests": sorted(tests_list, key=lambda x: x["nodeid"]),
        "summary": summary,
        "stdout": stdout,
        "stderr": stderr,
    }, stdout, stderr


def map_requirements(results: dict):
    """Map test names to requirement IDs (REQ-02 .. REQ-11) and build report summary."""
    reqs = [
        ("REQ-02", "Must use ctypes.windll.kernel32; no psutil for suspension", "test_req02_no_psutil_for_suspension"),
        ("REQ-03", "Must call CreateToolhelp32Snapshot and Thread32First/Thread32Next", "test_req03_create_toolhelp_snapshot_and_thread32"),
        ("REQ-04", "Every OpenThread handle closed via CloseHandle", "test_req04_open_thread_closed_via_close_handle"),
        ("REQ-05", "No reference to signal.SIGSTOP", "test_req05_no_sigstop"),
        ("REQ-06", "Must use GetForegroundWindow to find active PID", "test_req06_get_foreground_window_for_active_pid"),
        ("REQ-07", "Must attempt to enable SeDebugPrivilege", "test_req07_se_debug_privilege"),
        ("REQ-08", "Must implement or support ResumeThread loop", "test_req08_resume_thread_loop"),
        ("REQ-09", "UWP/PID mapping GetWindowThreadProcessId", "test_req09_uwp_pid_mapping_get_window_thread_process_id"),
        ("REQ-10", "THREADENTRY32/PROCESSENTRY32 ctypes defined correctly", "test_req10_ctypes_structures_defined"),
        ("REQ-11", "SuspendThread failure (-1) logged, no crash", "test_req11_suspend_thread_failure_handling"),
    ]
    test_outcomes = {t["name"]: t["outcome"] for t in results.get("tests", [])}
    requirement_status = []
    satisfied = 0
    for rid, desc, test_name in reqs:
        outcome = test_outcomes.get(test_name, "failed")
        status = "PASS" if outcome == "passed" else "FAIL"
        if status == "PASS":
            satisfied += 1
        requirement_status.append({
            "id": rid,
            "description": desc,
            "status": status,
            "checks": [test_name],
        })
    summary = results.get("summary", {})
    report_summary = {
        "total_requirements": len(reqs),
        "satisfied_requirements": satisfied,
        "failed_requirements": len(reqs) - satisfied,
        "total_checks": summary.get("total", 0),
        "passed_checks": summary.get("passed", 0),
        "failed_checks": summary.get("failed", 0) + summary.get("errors", 0),
    }
    return requirement_status, report_summary


def main():
    start_time = time.time()
    run_id = "".join(random.choices(string.hexdigits.lower(), k=8))
    root_dir = get_root_dir()
    evaluation_dir = root_dir / "evaluation"
    evaluation_dir.mkdir(parents=True, exist_ok=True)
    timestamp_dir = evaluation_dir / time.strftime("%Y-%m-%d") / time.strftime("%H-%M-%S")
    timestamp_dir.mkdir(parents=True, exist_ok=True)
    report_file = timestamp_dir / "report.json"

    print(f"Starting Evaluation Run: {run_id}")

    # Use temp file for pytest JSON report; parse then delete (no pytest_report.json in output dir)
    tmp = tempfile.NamedTemporaryFile(suffix=".json", delete=False)
    tmp_path = Path(tmp.name)
    tmp.close()
    try:
        results, _stdout, _stderr = run_pytest(root_dir, tmp_path)
    finally:
        tmp_path.unlink(missing_ok=True)

    finish_time = time.time()
    duration = finish_time - start_time

    requirement_status, report_summary = map_requirements(results)
    verdict_success = results["success"] and report_summary["failed_requirements"] == 0
    error_msg = None
    if not verdict_success:
        error_msg = "One or more requirements failed"
        if not results["success"] and results["summary"].get("errors", 0) > 0:
            error_msg = "Evaluation error: " + (results.get("stderr", "") or "")

    # RFC3339 timestamps with fractional seconds (microseconds; match Go-style)
    started_at_str = datetime.fromtimestamp(start_time, tz=timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")
    finished_at_str = datetime.fromtimestamp(finish_time, tz=timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")

    summary = results["summary"]
    before_results = {
        "success": False,
        "exit_code": 1,
        "tests": [],
        "summary": {"total": 0, "passed": 0, "failed": 0, "errors": 0, "skipped": 0},
        "stdout": "",
        "stderr": "",
    }
    report = {
        "run_id": run_id,
        "started_at": started_at_str,
        "finished_at": finished_at_str,
        "duration_seconds": duration,
        "success": verdict_success,
        "error": error_msg,
        "environment": get_environment(),
        "results": {
            "before": before_results,
            "after": results,
            "comparison": {
                "before_tests_passed": False,
                "after_tests_passed": results["success"],
                "before_total": 0,
                "before_passed": 0,
                "before_failed": 0,
                "after_total": summary.get("total", 0),
                "after_passed": summary.get("passed", 0),
                "after_failed": summary.get("failed", 0),
            },
        },
    }

    report_path = timestamp_dir / "report.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    label = "SUCCESS" if verdict_success else "FAILURE"
    print("\n" + "=" * 60)
    print("EVALUATION SUMMARY")
    print("=" * 60)
    print(f"repository_after: {label} ({results['summary']['passed']}/{results['summary']['total']} passed)")
    print(f"Requirements Satisfied: {report_summary['satisfied_requirements']}/{report_summary['total_requirements']}")
    print("=" * 60)
    print(f"Full report saved to: {report_path}")

    sys.exit(0)


if __name__ == "__main__":
    main()
