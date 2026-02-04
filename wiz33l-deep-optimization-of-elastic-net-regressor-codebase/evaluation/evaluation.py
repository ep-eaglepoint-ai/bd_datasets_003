#!/usr/bin/env python3
import sys
import json
import time
import uuid
import platform
import subprocess
import os
from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).resolve().parent.parent
REPORTS = ROOT / "evaluation" / "reports"

def environment_info():
    return {
        "python_version": platform.python_version(),
        "platform": platform.platform()
    }

def run_tests(version: str):
    """Run pytest for a specific version and capture results."""
    env = os.environ.copy()
    env['TEST_VERSION'] = version
    
    try:
        proc = subprocess.run(
            ["pytest", "tests/test_optimization.py", "-q", "--tb=no"],
            cwd=ROOT,
            env=env,
            capture_output=True,
            text=True,
            timeout=120
        )
        # We consider tests passed if return code is 0
        # For 'before', return_code 1 is expected, but 'passed' field should reflect pytest result
        return {
            "passed": proc.returncode == 0,
            "return_code": proc.returncode,
            "output": (proc.stdout + proc.stderr)[:8000]
        }
    except subprocess.TimeoutExpired:
        return {
            "passed": False,
            "return_code": -1,
            "output": "pytest timeout"
        }

def run_metrics(version: str):
    """Extract metrics like training time for speedup calculation."""
    # We run a small subset or parse from output if possible.
    # For simplicity and accuracy, we run the model once and time it.
    # This aligns with our test_optimization.py logic but exposes it as metrics.
    
    import numpy as np
    sys.path.insert(0, str(ROOT / (f"repository_{version}")))
    try:
        import elasticnet_deep_optimization as mod
        
        rng = np.random.default_rng(42)
        X = rng.normal(size=(500, 20))
        y = X @ rng.normal(size=20) + rng.normal(size=500)
        
        start = time.perf_counter()
        model = mod.ElasticNetRegressorVeryUnoptimized(epochs=100, verbose=0, seed=42)
        model.fit(X, y)
        duration = (time.perf_counter() - start) * 1000 # ms
        
        return {
            "avg_time_ms": round(duration, 2),
            "rows_processed": 500
        }
    except Exception as e:
        print(f"Error collecting metrics for {version}: {e}")
        return {}
    finally:
        if str(ROOT / (f"repository_{version}")) in sys.path:
            sys.path.remove(str(ROOT / (f"repository_{version}")))

def evaluate(repo_name: str):
    version = repo_name.replace("repository_", "")
    tests = run_tests(version)
    metrics = run_metrics(version)
    return {
        "tests": tests,
        "metrics": metrics
    }

def run_evaluation():
    run_id = str(uuid.uuid4())
    start = datetime.utcnow()
    
    before = evaluate("repository_before")
    after = evaluate("repository_after")
    
    # Speedup calculation
    before_time = before["metrics"].get("avg_time_ms", 0)
    after_time = after["metrics"].get("avg_time_ms", 0)
    speedup = before_time / after_time if after_time > 0 else 0
    
    comparison = {
        "passed_gate": after["tests"]["passed"],
        "improvement_summary": f"Speedup: {speedup:.2f}x. Optimization tests passed: {after['tests']['passed']}."
    }
    
    end = datetime.utcnow()
    return {
        "run_id": run_id,
        "started_at": start.isoformat() + "Z",
        "finished_at": end.isoformat() + "Z",
        "duration_seconds": (end - start).total_seconds(),
        "environment": environment_info(),
        "before": before,
        "after": after,
        "comparison": comparison,
        "success": comparison["passed_gate"],
        "error": None
    }

def main():
    REPORTS.mkdir(parents=True, exist_ok=True)
    report = run_evaluation()
    path = REPORTS / "latest.json"
    path.write_text(json.dumps(report, indent=2))
    
    print(f"Report written to {path}")
    print(f"Final Success: {report['success']}")
    
    # Clean up old file if it exists
    old_script = ROOT / "evaluation" / "run_evaluation.py"
    if old_script.exists():
        old_script.unlink()
        
    return 0 if report["success"] else 1

if __name__ == "__main__":
    sys.exit(main())
