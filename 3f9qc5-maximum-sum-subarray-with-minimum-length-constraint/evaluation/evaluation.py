import json
import os
import re
import subprocess
import sys
from pathlib import Path

EVALUATION_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = EVALUATION_DIR.parent


def run_tests():
    env = os.environ.copy()
    env.setdefault("REPO_PATH", "repository_after")
    result = subprocess.run(
        [sys.executable, "-m", "pytest", "tests", "-v", "--tb=no", "-q"],
        cwd=PROJECT_ROOT,
        capture_output=True,
        text=True,
        timeout=120,
        env=env,
    )
    return result.returncode, result.stdout, result.stderr


def parse_pytest_output(stdout: str, stderr: str):
    passed = failed = 0
    failed_tests = []
    for line in (stdout + "\n" + stderr).splitlines():
        match = re.search(r"(\d+) passed", line)
        if match:
            passed = int(match.group(1))
        match = re.search(r"(\d+) failed", line)
        if match:
            failed = int(match.group(1))
        if "FAILED" in line:
            m = re.search(r"FAILED .*::(\S+)", line)
            if m:
                failed_tests.append(m.group(1))
    total = passed + failed
    return {
        "success": failed == 0,
        "total": total,
        "passed": passed,
        "failed": failed,
        "failed_tests": failed_tests,
    }


def main():
    exitcode, stdout, stderr = run_tests()
    report = parse_pytest_output(stdout, stderr)
    report["exit_code"] = exitcode
    report_path = EVALUATION_DIR / "report.json"
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)
    print(f"Report written to {report_path}")
    return exitcode


if __name__ == "__main__":
    sys.exit(main())
