import json
import os
import platform
import subprocess
import time
import uuid
from datetime import datetime
from pathlib import Path

def get_env_info():
    """Gathers Python-specific environment metadata."""
    return {
        "python_version": platform.python_version(),
        "platform": platform.system().lower(),
        "arch": platform.machine(),
        "cpus": os.cpu_count()
    }

def run_after_tests():
    """Runs pytest and captures the results."""
    # The command you provided
    args = ["pytest", "-v"]

    try:
        # Capture_output combines stdout and stderr
        result = subprocess.run(
            args,
            capture_output=True,
            text=True
        )
        output = result.stdout + result.stderr
        return_code = result.returncode
    except FileNotFoundError:
        output = "Error: pytest not found. Is it installed in your virtualenv?"
        return_code = 1
    except Exception as e:
        output = str(e)
        return_code = 1

    # Truncate output to 1000 chars to match your Go logic
    if len(output) > 1000:
        output = output[:1000]

    return {
        "passed": return_code == 0,
        "return_code": return_code,
        "output": output
    }

def main():
    run_id = str(uuid.uuid4())
    start_time = datetime.now()
    start_perf = time.perf_counter()

    print(f"Starting Python evaluation (Run ID: {run_id})...")

    # Run the pytest suite
    after_result = run_after_tests()

    duration = time.perf_counter() - start_perf
    end_time = datetime.now()

    summary = "All after tests passed." if after_result["passed"] else "After tests failed."

    # Constructing the report structure
    report = {
        "run_id": run_id,
        "started_at": start_time.isoformat(),
        "finished_at": end_time.isoformat(),
        "duration_seconds": round(duration, 4),
        "environment": get_env_info(),
        "before": {},  # Kept as empty dict to match Go's *struct{}
        "after": {
            "tests": after_result
        },
        "comparison": {
            "passed_gate": after_result["passed"],
            "improvement_summary": summary
        },
        "success": after_result["passed"]
    }

    # Setup reporting directory
    report_dir = Path("evaluation/reports")
    report_dir.mkdir(parents=True, exist_ok=True)
    report_path = report_dir / "report.json"

    # Write JSON report
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)

    print(f"Evaluation complete. Success: {report['success']}")
    print(f"Report written to: {report_path}")

    # Exit with error code if tests failed
    if not report["success"]:
        exit(1)

if __name__ == "__main__":
    main()