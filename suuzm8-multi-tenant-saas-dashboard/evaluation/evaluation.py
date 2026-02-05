#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import os
import platform
import re
import secrets
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Tuple

Outcome = Literal["passed", "failed", "error", "skipped"]

FORBIDDEN_MARKERS = [
    "No tests found, exiting with code 1",
    "JavaScript heap out of memory",
    "EADDRINUSE",
]


def truncate_output(s: str, max_len: int = 65536) -> str:
    if not isinstance(s, str):
        return ""
    if len(s) <= max_len:
        return s
    tail = "\n...<truncated>...\n"
    keep = max(0, max_len - len(tail))
    return s[:keep] + tail


_ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")


def strip_ansi(s: str) -> str:
    return _ANSI_RE.sub("", str(s))


def run_one_line(cmd: List[str]) -> str:
    try:
        r = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
        first = (r.stdout or "").split("\n", 1)[0].strip()
        return first
    except Exception:
        return "unknown"


@dataclass
class TestCase:
    name: str
    outcome: Outcome


@dataclass
class RunResults:
    success: bool
    exit_code: int
    tests: List[TestCase]
    output: str


def _unique_push(tests: List[TestCase], name: str, outcome: Outcome) -> None:
    for t in tests:
        if t.name == name:
            return
    tests.append(TestCase(name=name, outcome=outcome))


def _tests_push(tests: List[TestCase], name: str, outcome: Outcome) -> None:
    tests.append(TestCase(name=name, outcome=outcome))


def run_command_merged(
    cmd: List[str],
    timeout_s: int,
    cwd: Path,
    env: Dict[str, str],
) -> Tuple[int, str]:
    try:
        r = subprocess.run(
            cmd,
            cwd=str(cwd),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            encoding="utf-8",
            errors="replace",
            timeout=max(1, timeout_s),
            check=False,
        )
        combined = (r.stdout or "") + "\n" + (r.stderr or "")
        return int(r.returncode), truncate_output(combined)
    except subprocess.TimeoutExpired as e:
        out = ""
        if e.stdout:
            out += e.stdout if isinstance(e.stdout, str) else e.stdout.decode("utf-8", "replace")
        if e.stderr:
            out += "\n" + (e.stderr if isinstance(e.stderr, str) else e.stderr.decode("utf-8", "replace"))
        return 124, truncate_output(out + "\nTIMED OUT\n")
    except Exception as e:
        return -1, truncate_output(f"runner error: {e}\n")


_PYTEST_LINE_RE = re.compile(
    r"^\s*(?P<name>[^\s].*?::[^\s]+)\s+(?P<status>PASSED|FAILED|SKIPPED|XFAIL|XPASS|ERROR)(?:\s+\[.*\])?\s*$"
)


def parse_pytest_output(rr: RunResults) -> None:
    out = strip_ansi(rr.output or "")
    for raw in out.split("\n"):
        line = raw.rstrip("\r")
        m = _PYTEST_LINE_RE.match(line)
        if not m:
            continue
        name = (m.group("name") or "").strip()
        status = (m.group("status") or "").strip().upper()
        if not name:
            continue
        if status in {"PASSED", "XPASS"}:
            _unique_push(rr.tests, name, "passed")
        elif status in {"SKIPPED", "XFAIL"}:
            _unique_push(rr.tests, name, "skipped")
        elif status == "FAILED":
            _unique_push(rr.tests, name, "failed")
        else:
            _unique_push(rr.tests, name, "error")


def parse_vitest_output(rr: RunResults) -> None:
    out = strip_ansi(rr.output or "")
    for raw in out.split("\n"):
        line = raw.rstrip("\r")
        # Examples:
        #  ✓ ../../tests/client/Dashboard.test.tsx (2)
        #  × test name
        m_pass = re.match(r"^\s*[✓√]\s+(.*)$", line)
        if m_pass:
            name = (m_pass.group(1) or "").strip()
            if name:
                _unique_push(rr.tests, name, "passed")
            continue
        m_fail = re.match(r"^\s*[×✗xX✕]\s+(.*)$", line)
        if m_fail:
            name = (m_fail.group(1) or "").strip()
            if name:
                _unique_push(rr.tests, name, "failed")
            continue


def compute_success(rr: RunResults) -> bool:
    if not rr.tests:
        return False
    for t in rr.tests:
        if t.outcome in {"failed", "error"}:
            return False
    return True


def has_docker_compose() -> bool:
    try:
        r = subprocess.run(
            ["docker", "compose", "version"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
        return r.returncode == 0
    except Exception:
        return False


def run_server_suite(project_root: Path, timeout_s: int) -> RunResults:
    rr = RunResults(success=False, exit_code=-1, tests=[], output="")

    if not has_docker_compose():
        rr.exit_code = -1
        rr.output = truncate_output("docker compose not available\n")
        _tests_push(rr.tests, "server:runner", "error")
        rr.success = False
        return rr

    cmd = [
        "docker",
        "compose",
        "run",
        "--rm",
        "--entrypoint",
        "pytest",
        "app",
        "-q",
        "-vv",
        "--cov=repository_after/server",
        "--cov-report=term-missing",
        "tests",
    ]

    exit_code, output = run_command_merged(
        cmd,
        timeout_s=timeout_s,
        cwd=project_root,
        env={**os.environ, "FORCE_COLOR": "0", "NO_COLOR": "1"},
    )
    rr.exit_code = exit_code
    rr.output = output

    found_forbidden = next((m for m in FORBIDDEN_MARKERS if m in rr.output), None)
    if found_forbidden:
        _tests_push(rr.tests, f"marker:{found_forbidden}", "error")

    parse_pytest_output(rr)

    if not rr.tests:
        _tests_push(rr.tests, "server:runner", "error")

    rr.success = compute_success(rr)
    return rr


def run_client_suite(project_root: Path, timeout_s: int) -> RunResults:
    rr = RunResults(success=False, exit_code=-1, tests=[], output="")

    if not has_docker_compose():
        rr.exit_code = -1
        rr.output = truncate_output("docker compose not available\n")
        _tests_push(rr.tests, "client:runner", "error")
        rr.success = False
        return rr

    # Run vitest with verbose reporter to improve parsing.
    cmd = [
        "docker",
        "compose",
        "run",
        "--rm",
        "--entrypoint",
        "sh",
        "client",
        "-lc",
        "npm install --silent && ./node_modules/.bin/vitest run --config vitest.config.ts --reporter verbose",
    ]

    exit_code, output = run_command_merged(
        cmd,
        timeout_s=timeout_s,
        cwd=project_root,
        env={**os.environ, "FORCE_COLOR": "0", "NO_COLOR": "1"},
    )
    rr.exit_code = exit_code
    rr.output = output

    found_forbidden = next((m for m in FORBIDDEN_MARKERS if m in rr.output), None)
    if found_forbidden:
        _tests_push(rr.tests, f"marker:{found_forbidden}", "error")

    parse_vitest_output(rr)

    if not rr.tests:
        _tests_push(rr.tests, "client:runner", "error")

    rr.success = compute_success(rr)
    return rr


def summarize(rr: RunResults) -> Dict[str, int]:
    passed = failed = errors = skipped = 0
    for t in rr.tests:
        if t.outcome == "passed":
            passed += 1
        elif t.outcome == "failed":
            failed += 1
        elif t.outcome == "error":
            errors += 1
        else:
            skipped += 1
    return {"total": len(rr.tests), "passed": passed, "failed": failed, "errors": errors, "skipped": skipped}


def write_report_json(report_path: Path, run_id: str, server: RunResults, client: RunResults) -> None:
    started_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    git_commit = (run_one_line(["git", "rev-parse", "HEAD"]) or "unknown")[:8]
    git_branch = run_one_line(["git", "rev-parse", "--abbrev-ref", "HEAD"]) or "unknown"

    env = {
        "platform": platform.platform(),
        "os": "linux" if sys.platform.startswith("linux") else sys.platform,
        "python": sys.version.split(" ", 1)[0],
        "docker": run_one_line(["docker", "--version"]),
        "docker_compose": run_one_line(["docker", "compose", "version"]),
        "git_commit": git_commit or "unknown",
        "git_branch": git_branch or "unknown",
    }

    criteria = {
        "server_suite_passes": "Pass" if server.success else "Fail",
        "client_suite_passes": "Pass" if client.success else "Fail",
        "both_pass": "Pass" if (server.success and client.success) else "Fail",
    }

    report: Dict[str, Any] = {
        "run_id": run_id,
        "tool": "SUUZM8 Test Evaluator",
        "started_at": started_at,
        "environment": env,
        "runs": {
            "server": {
                "success": bool(server.success),
                "exit_code": int(server.exit_code),
                "summary": summarize(server),
                "tests": [t.__dict__ for t in server.tests],
                "output": server.output or "",
            },
            "client": {
                "success": bool(client.success),
                "exit_code": int(client.exit_code),
                "summary": summarize(client),
                "tests": [t.__dict__ for t in client.tests],
                "output": client.output or "",
            },
        },
        "criteria_analysis": criteria,
        "comparison": {
            "summary": "Server (pytest) + Client (vitest) validation",
            "success": bool(server.success and client.success),
        },
    }

    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Run server+client tests and write evaluation/report.json")
    parser.add_argument("--output", default="evaluation/report.json", help="Output path (relative to project root)")
    parser.add_argument("--timeout", default=360, type=int, help="Timeout per suite in seconds")
    args = parser.parse_args()

    project_root = Path(__file__).resolve().parents[1]
    report_path = Path(args.output)
    if not report_path.is_absolute():
        report_path = project_root / report_path

    run_id = secrets.token_hex(4)
    sys.stdout.write(f"Starting SUUZM8 Evaluation [Run ID: {run_id}]\n")

    server = run_server_suite(project_root, int(args.timeout))
    client = run_client_suite(project_root, int(args.timeout))

    try:
        write_report_json(report_path, run_id, server, client)
        sys.stdout.write(f"Report saved to: {report_path}\n")
    except Exception as e:
        sys.stderr.write(f"evaluation: failed to write report: {e}\n")

    # evaluator must never fail the harness
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as e:
        # Always exit 0
        try:
            sys.stderr.write(f"evaluation: fatal error: {e}\n")
        except Exception:
            pass
        raise SystemExit(0)
