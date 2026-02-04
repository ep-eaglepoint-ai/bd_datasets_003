import os
import json
import subprocess
import uuid
from datetime import datetime

ROOT = "/app"
REPORTS_DIR = os.path.join(ROOT, "evaluation", "reports")

def run_tests(repo_path):
    print(f"--- Running tests for: {repo_path} ---")
    
    env = os.environ.copy()
    env["REPO_PATH"] = repo_path
    repo_abs_path = os.path.join(ROOT, repo_path, "backend")
    env["PYTHONPATH"] = f"{repo_abs_path}:{env.get('PYTHONPATH', '')}"
    
    test_file = os.path.join(ROOT, "tests", "test_api.py")
    
    result = subprocess.run(
        ["python", "-m", "pytest", test_file],
        cwd=ROOT,
        capture_output=True,
        text=True,
        env=env
    )
    
    return {
        "passed": result.returncode == 0,
        "return_code": result.returncode,
        "output": result.stdout if result.stdout else result.stderr
    }

def run_evaluation():
    start_time = datetime.utcnow().isoformat()
    
    before_result = run_tests("repository_before")
    
    after_result = run_tests("repository_after")

    improvement = after_result["passed"] and not before_result["passed"]

    report = {
        "run_id": str(uuid.uuid4()),
        "started_at": start_time,
        "finished_at": datetime.utcnow().isoformat(),
        "before": {"tests": before_result},
        "after": {"tests": after_result},
        "comparison": {
            "passed_gate": after_result["passed"],
            "improvement": improvement
        },
        "success": after_result["passed"]
    }

    os.makedirs(REPORTS_DIR, exist_ok=True)
    report_path = os.path.join(REPORTS_DIR, "report.json")
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)

    print(f"\nEvaluation Complete! Success: {report['success']}")
    print(f"Report saved to: {report_path}")

if __name__ == "__main__":
    run_evaluation()