import os
import sys
import json
import uuid
import platform
import subprocess
import argparse
from datetime import datetime
from pathlib import Path


def generate_run_id() -> str:
    return uuid.uuid4().hex[:8]


def get_git_info() -> dict:
    git_info = {"git_commit": "unknown", "git_branch": "unknown"}
    try:
        result = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True, timeout=5)
        if result.returncode == 0:
            git_info["git_commit"] = result.stdout.strip()[:8]
        result = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"], capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            git_info["git_branch"] = result.stdout.strip()
    except Exception:
        pass
    return git_info


def get_environment_info() -> dict:
    git = get_git_info()
    return {
        "python_version": platform.python_version(),
        "platform": platform.platform(),
        "os": platform.system(),
        "git_commit": git["git_commit"],
        "git_branch": git["git_branch"],
    }


def generate_output_path(project_root: Path) -> Path:
    now = datetime.now()
    output_dir = project_root / "evaluation"
    output_dir.mkdir(parents=True, exist_ok=True)
    return output_dir / "report.json"


def parse_pytest_verbose_output(output: str) -> list:
    tests = []
    for raw in output.splitlines():
        line = raw.strip()
        if "::" not in line:
            continue

        outcome = None
        if " PASSED" in line:
            outcome = "passed"
        elif " FAILED" in line:
            outcome = "failed"
        elif " ERROR" in line:
            outcome = "error"
        elif " SKIPPED" in line:
            outcome = "skipped"

        if not outcome:
            continue

        nodeid = line.split(" ")[0]
        test_name = nodeid.split("::")[-1]
        tests.append({"nodeid": nodeid, "name": test_name, "outcome": outcome})

    return tests


def run_evaluation_tests(project_root: Path, tests_dir: Path, timeout_s: int = 120) -> dict:
    """Run pytest for this project and return parsed results.

    Notes:
      - Tests import from `repository_after.*`, so we just ensure the project root
        is on PYTHONPATH.
    """

    env = os.environ.copy()
    env["PYTHONPATH"] = str(project_root) + os.pathsep + env.get("PYTHONPATH", "")

    cmd = [sys.executable, "-m", "pytest", str(tests_dir), "-vv", "--tb=short"]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout_s, env=env)
        stdout = result.stdout
        stderr = result.stderr

        tests = parse_pytest_verbose_output(stdout)

        summary = {
            "total": len(tests),
            "passed": sum(1 for t in tests if t["outcome"] == "passed"),
            "failed": sum(1 for t in tests if t["outcome"] == "failed"),
            "errors": sum(1 for t in tests if t["outcome"] == "error"),
            "skipped": sum(1 for t in tests if t["outcome"] == "skipped"),
        }

        return {
            "success": result.returncode == 0,
            "exit_code": result.returncode,
            "tests": tests,
            "summary": summary,
            "stdout": stdout,
            "stderr": stderr,
        }

    except subprocess.TimeoutExpired:
        return {
            "success": False,
            "exit_code": -1,
            "tests": [],
            "summary": {"total": 0, "passed": 0, "failed": 0, "errors": 1, "skipped": 0},
            "stdout": "",
            "stderr": f"Evaluation timed out (>{timeout_s}s).",
        }
    except Exception as e:
        return {
            "success": False,
            "exit_code": -1,
            "tests": [],
            "summary": {"total": 0, "passed": 0, "failed": 0, "errors": 1, "skipped": 0},
            "stdout": "",
            "stderr": str(e),
        }


def map_criteria(tests: list) -> dict:
    """Map test outcomes to the project's 8 core requirements."""

    def check(name_fragment: str) -> str:
        for t in tests:
            if name_fragment in t["name"]:
                return "Pass" if t["outcome"] == "passed" else "Fail"
        return "Not Run"

    return {
        # 1) Numerical integration + stall detection
        "numerical_integration_and_stall": check("test_stall_on_slope"),
        # 2) Drag proportional to v^2
        "aero_drag_quadratic": check("test_drag_force_quadratic"),
        # 3) Rolling friction based on dynamic normal force
        "friction_uses_dynamic_normal_force": check("test_friction_dynamic_normal_force"),
        # 4) Circular segments apply centripetal accel v^2/r via curvature
        "centripetal_logic_on_arcs": check("test_derailment_at_loop_top"),
        # 5) Gravity decomposition (parallel & normal components)
        "gravity_components_on_slope": check("test_initial_g_force"),
        # 6) No external physics engine (informational; enforced by dependency policy)
        # 7) Track maximum positive G and enforce limits
        "positive_g_limit_enforced": check("test_g_limits_exceeded_min"),
        # 8) Track minimum/negative G and enforce derailment policy when N<0
        "negative_g_and_derailment": check("test_negative_g_derailment_on_hill"),
    }


def main() -> None:
    try:
        parser = argparse.ArgumentParser()
        parser.add_argument("--output", type=str, default=None, help="Custom path for report.json")
        parser.add_argument("--timeout", type=int, default=120, help="Test timeout in seconds")
        args = parser.parse_args()

        run_id = generate_run_id()

        current_file_path = Path(__file__).resolve()
        project_root = current_file_path.parent.parent

        tests_dir = project_root / "tests"
        if not tests_dir.exists():
            print(f"Error: Could not locate tests directory at {tests_dir}")
            sys.exit(0)

        print(f"Starting Coaster Safety Validator Evaluation [Run ID: {run_id}]")

        # This dataset task does not provide repository_before.
        results_before = None

        # Evaluate AFTER (the code under test)
        repo_after = project_root / "repository_after"
        if not repo_after.exists():
            results_after = {
                "success": False,
                "exit_code": -1,
                "tests": [],
                "summary": {"total": 0, "passed": 0, "failed": 0, "errors": 1, "skipped": 0},
                "stdout": "",
                "stderr": "repository_after directory not found",
            }
        else:
            results_after = run_evaluation_tests(project_root=project_root, tests_dir=tests_dir, timeout_s=args.timeout)

        criteria_analysis = map_criteria(results_after["tests"]) if results_after.get("tests") else {}

        report = {
            "run_id": run_id,
            "tool": "Coaster Safety Validator Evaluator",
            "started_at": datetime.now().isoformat(),
            "environment": get_environment_info(),
            "before": results_before,
            "after": results_after,
            "criteria_analysis": criteria_analysis,
            "comparison": {
                "summary": "Single-target evaluation for repository_after (no baseline repository_before)",
                "improvement_detected": None,
                "success": bool(results_after.get("success")),
            },
        }

        output_path = Path(args.output) if args.output else generate_output_path(project_root)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        with open(output_path, "w") as f:
            json.dump(report, f, indent=2)

        print(f"\nReport saved to: {output_path}")

    except Exception as e:
        print(f"INTERNAL EVALUATION SCRIPT ERROR: {e}")

    # ALWAYS EXIT 0
    sys.exit(0)


if __name__ == "__main__":
    main()
