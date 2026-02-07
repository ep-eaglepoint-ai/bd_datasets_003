#!/usr/bin/env python3

from __future__ import annotations

import json
import os
import platform
import subprocess
import sys
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
TASK_TITLE = "6JFPFV - REST API Client Resilience Test Suite"


def _utc_now() -> datetime:
	return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
	return dt.isoformat().replace("+00:00", "Z")


def _git_info() -> dict:
	def _run(args: list[str]) -> str:
		try:
			proc = subprocess.run(
				args,
				cwd=ROOT,
				capture_output=True,
				text=True,
				timeout=5,
			)
			if proc.returncode != 0:
				return "unknown"
			return proc.stdout.strip() or "unknown"
		except Exception:
			return "unknown"

	return {
		"git_commit": _run(["git", "rev-parse", "HEAD"]),
		"git_branch": _run(["git", "rev-parse", "--abbrev-ref", "HEAD"]),
	}


@dataclass
class PytestRun:
	success: bool
	exit_code: int
	stdout: str
	stderr: str
	summary: dict
	tests: list[dict]


def _parse_pytest_json(report_json: dict) -> tuple[list[dict], dict]:
	tests: list[dict] = []
	passed = failed = errors = skipped = 0

	# pytest-json-report schema: https://pypi.org/project/pytest-json-report/
	# - report_json["tests"]: list of {"nodeid", "outcome", ...}
	for t in report_json.get("tests", []) or []:
		nodeid = t.get("nodeid") or "unknown"
		outcome = t.get("outcome") or "unknown"
		if outcome == "passed":
			passed += 1
		elif outcome == "failed":
			failed += 1
		elif outcome == "skipped":
			skipped += 1
		else:
			errors += 1
		tests.append({"nodeid": nodeid, "name": nodeid, "outcome": outcome})

	total = len(tests)
	summary = {"total": total, "passed": passed, "failed": failed, "errors": errors, "skipped": skipped}
	return tests, summary


def run_pytest(test_args: list[str], cwd: Path) -> PytestRun:
	json_path = cwd / ".pytest-report.json"
	if json_path.exists():
		json_path.unlink()

	proc = subprocess.run(
		[
			sys.executable,
			"-m",
			"pytest",
			*test_args,
			"--json-report",
			f"--json-report-file={json_path}",
		],
		cwd=cwd,
		capture_output=True,
		text=True,
		timeout=180,
	)

	stdout = proc.stdout
	stderr = proc.stderr

	parsed_tests: list[dict]
	summary: dict
	try:
		report_json = json.loads(json_path.read_text(encoding="utf-8")) if json_path.exists() else None
		parsed_tests, summary = _parse_pytest_json(report_json or {})
	except Exception:
		parsed_tests, summary = [], {"total": 0, "passed": 0, "failed": 0, "errors": 0, "skipped": 0}

	return PytestRun(
		success=proc.returncode == 0,
		exit_code=proc.returncode,
		stdout=stdout[:8000],
		stderr=stderr[:8000],
		summary=summary,
		tests=parsed_tests,
	)


def _format_results_block(summary: dict, tests: list[dict]) -> str:
	lines = [
		f"Results: {summary['passed']} passed, {summary['failed']} failed, {summary['errors']} errors, {summary['skipped']} skipped (total: {summary['total']})"
	]
	for t in tests:
		if t.get("outcome") == "passed":
			lines.append(f"  [✓ PASS] {t.get('name')}")
	return "\n".join(lines)


def write_patch() -> None:
	patches_dir = ROOT / "patches"
	patches_dir.mkdir(parents=True, exist_ok=True)
	patch_path = patches_dir / "diff.patch"
	try:
		with patch_path.open("w", encoding="utf-8") as f:
			subprocess.run(
				[
					"git",
					"diff",
					"--no-index",
					"repository_before",
					"repository_after",
				],
				cwd=ROOT,
				stdout=f,
				stderr=subprocess.DEVNULL,
				check=False,
				text=True,
			)
	except FileNotFoundError:
		patch_path.write_text("", encoding="utf-8")


def run_evaluation() -> dict:
	run_id = str(uuid.uuid4())
	started_at = _utc_now()

	# Primary: run tests next to the code (repository_after)
	primary_location = "repository_after"
	primary = run_pytest(["-q", "repository_after"], cwd=ROOT)

	# Meta: run tests/ directory
	meta = run_pytest(["-q", "tests"], cwd=ROOT)

	finished_at = _utc_now()
	duration = (finished_at - started_at).total_seconds()

	overall_success = bool(primary.success and meta.success)

	env = {
		"python_version": platform.python_version(),
		"platform": platform.platform(),
		"os": os.name,
		"os_release": platform.release(),
		"architecture": platform.machine(),
		"hostname": platform.node(),
		**_git_info(),
	}

	return {
		"run_id": run_id,
		"task_title": TASK_TITLE,
		"started_at": _iso(started_at),
		"finished_at": _iso(finished_at),
		"duration_seconds": duration,
		"success": overall_success,
		"error": None,
		"environment": env,
		"primary_test_results": {
			"location": primary_location,
			"success": primary.success,
			"exit_code": primary.exit_code,
			"tests": primary.tests,
			"summary": primary.summary,
			"stdout": primary.stdout,
			"stderr": primary.stderr,
		},
		"meta_test_results": {
			"directory": "/app/tests",
			"success": meta.success,
			"exit_code": meta.exit_code,
			"tests": meta.tests,
			"summary": meta.summary,
			"stdout": meta.stdout,
			"stderr": meta.stderr,
		},
		"overall_status": "PASSED" if overall_success else "FAILED",
	}


def main() -> int:
	report = None
	run_id = None
	started_at = _utc_now()
	try:
		report = run_evaluation()
		run_id = report["run_id"]
	except Exception as e:
		finished_at = _utc_now()
		report = {
			"run_id": str(uuid.uuid4()),
			"task_title": TASK_TITLE,
			"started_at": _iso(started_at),
			"finished_at": _iso(finished_at),
			"duration_seconds": (finished_at - started_at).total_seconds(),
			"success": False,
			"error": str(e),
		}
		run_id = report["run_id"]

	# Save report
	ts = _utc_now()
	out_dir = ROOT / "evaluation" / ts.strftime("%Y-%m-%d") / ts.strftime("%H-%M-%S")
	out_dir.mkdir(parents=True, exist_ok=True)
	report_path = out_dir / "report.json"
	report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")

	# Always create patch artifact
	write_patch()

	# Print required console format
	print(f"Run ID: {report['run_id']}")
	print(f"Started at: {report.get('started_at', _iso(started_at))}")
	print()
	print("=" * 60)
	print(f"{TASK_TITLE} TEST EVALUATION")
	print("=" * 60)
	print()

	primary = report.get("primary_test_results", {})
	meta = report.get("meta_test_results", {})

	print("=" * 60)
	print("RUNNING PRIMARY TESTS")
	print("=" * 60)
	print(f"Test location: {primary.get('location', 'repository_before')}")
	if "summary" in primary and "tests" in primary:
		print()
		print(_format_results_block(primary["summary"], primary["tests"]))
	print()

	print("=" * 60)
	print("RUNNING META-TESTS")
	print("=" * 60)
	print("Meta-tests directory: /app/tests")
	if "summary" in meta and "tests" in meta:
		print()
		print(_format_results_block(meta["summary"], meta["tests"]))
	print()

	print("=" * 60)
	print("EVALUATION SUMMARY")
	print("=" * 60)
	print()
	p_sum = primary.get("summary", {"total": 0, "passed": 0})
	m_sum = meta.get("summary", {"total": 0, "passed": 0})
	print("Primary Tests:")
	print(f"  Overall: {'PASSED' if primary.get('success') else 'FAILED'}")
	print(f"  Tests: {p_sum.get('passed', 0)}/{p_sum.get('total', 0)} passed")
	print()
	print("Meta-Tests:")
	print(f"  Overall: {'PASSED' if meta.get('success') else 'FAILED'}")
	print(f"  Tests: {m_sum.get('passed', 0)}/{m_sum.get('total', 0)} passed")
	print()

	print("=" * 60)
	print("EXPECTED BEHAVIOR CHECK")
	print("=" * 60)
	if primary.get("success"):
		print("[✓ OK] Primary tests passed")
	else:
		print("[X] Primary tests passed")
	if meta.get("success"):
		print("[✓ OK] Meta-tests passed")
	else:
		print("[X] Meta-tests passed")
	print()
	print("Report saved to:")
	print(str(report_path.relative_to(ROOT)))
	print()

	print("=" * 60)
	print("EVALUATION COMPLETE")
	print("=" * 60)
	print(f"Run ID: {report['run_id']}")
	print(f"Duration: {report.get('duration_seconds', 0.0):.3f}s")
	print(f"Success: {'YES' if report.get('success') else 'NO'}")

	return 0 if report.get("success") else 1


if __name__ == "__main__":
	sys.exit(main())

