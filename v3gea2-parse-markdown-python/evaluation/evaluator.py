import json
import os
import platform
import subprocess
import sys
import uuid
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPORTS_DIR = ROOT / "evaluation" / "reports"
REPORTS_DIR.mkdir(parents=True, exist_ok=True)


def get_environment_info():
    return {
        "python_version": platform.python_version(),
        "platform": platform.system(),
        "arch": platform.machine(),
        "cpus": os.cpu_count(),
    }


def run_tests(repo_name: str):
    """
    Run pytest with PARSER_PATH pointing at repo_name/parser.py
    """
    parser_path = ROOT / repo_name

    if not parser_path.exists():
        return {
            "passed": False,
            "return_code": 1,
            "output": f"parser.py not found at {parser_path}",
        }

    env = os.environ.copy()
    env["CI"] = "true"
    env["PARSER_PATH"] = str(parser_path)

    proc = subprocess.run(
        ["pytest", "-q"],
        cwd=ROOT,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    passed = proc.returncode == 0
    output = proc.stderr if proc.stderr else proc.stdout

    return {
        "passed": passed,
        "return_code": proc.returncode,
        "output": output.strip(),
    }


def run_evaluation():
    run_id = str(uuid.uuid4())
    start_time = datetime.utcnow()

    print(f"Starting evaluation (Run ID: {run_id})")

    # 1. Run baseline
    print("Running baseline tests (before)...")
    before_result = run_tests("repository_before")

    # 2. Run refactor
    print("Running refactor tests (after)...")
    after_result = run_tests("repository_after")

    end_time = datetime.utcnow()
    duration_seconds = (end_time - start_time).total_seconds()

    # 3. Comparison summary
    if not before_result["passed"] and after_result["passed"]:
        improvement_summary = "Refactor fixed failing tests and met requirements."
    elif before_result["passed"] and after_result["passed"]:
        improvement_summary = "Tests passed in both states (verify baseline expectations)."
    elif not after_result["passed"]:
        improvement_summary = "Refactored code failed to pass requirements."
    else:
        improvement_summary = "No improvement detected."

    report = {
        "run_id": run_id,
        "started_at": start_time.isoformat() + "Z",
        "finished_at": end_time.isoformat() + "Z",
        "duration_seconds": duration_seconds,
        "environment": get_environment_info(),
        "before": {
            "tests": {
                "passed": before_result["passed"],
                "return_code": before_result["return_code"],
                "output": before_result["output"][:500],
            },
            "metrics": {},
        },
        "after": {
            "tests": {
                "passed": after_result["passed"],
                "return_code": after_result["return_code"],
                "output": "All tests passed." if after_result["passed"] else after_result["output"][:500],
            },
            "metrics": {},
        },
        "comparison": {
            "passed_gate": after_result["passed"],
            "improvement_summary": improvement_summary,
        },
        "success": after_result["passed"],
        "error": None,
    }

    report_path = REPORTS_DIR / "report.json"
    report_path.write_text(json.dumps(report, indent=2))

    print(f"Evaluation complete. Success: {report['success']}")
    print(f"Report written to: {report_path}")

    sys.exit(0 if report["success"] else 1)


if __name__ == "__main__":
    run_evaluation()
