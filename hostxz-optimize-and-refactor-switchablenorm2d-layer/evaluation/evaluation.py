#!/usr/bin/env python3
"""
Evaluation script for SwitchableNorm2d implementation.

- Runs pytest on tests/ (captures stdout/stderr and status).
- Performs a quick programmatic import + forward check.
- Collects environment info.
- Writes a single JSON report to evaluation/reports/report.json.
- Prints a readable summary and short previews to the terminal.
"""
import json
import os
import subprocess
import sys
import time
import traceback
from datetime import datetime
from pathlib import Path
from typing import Dict, Any

ROOT = Path(__file__).parent.parent.resolve()
REPORTS_DIR = ROOT / "evaluation" / "reports"
REPORTS_DIR.mkdir(parents=True, exist_ok=True)


def get_env_info() -> Dict[str, Any]:
    info: Dict[str, Any] = {
        "timestamp": datetime.now().isoformat(),
        "python_version": sys.version,
        "platform": sys.platform,
        "cwd": str(ROOT),
    }
    try:
        import torch
        info["torch"] = {
            "version": torch.__version__,
            "cuda_available": torch.cuda.is_available(),
            "cuda_version": torch.version.cuda if torch.cuda.is_available() else None,
        }
    except Exception as e:
        info["torch_error"] = str(e)
    return info


def run_pytest(timeout: int = 120) -> Dict[str, Any]:
    """
    Run pytest on the tests folder. Returns a result dict with status, stdout/stderr and duration.
    """
    test_path = ROOT / "tests"
    if not test_path.exists():
        return {"success": False, "error": f"tests/ directory not found at {test_path}"}

    env = os.environ.copy()
    # Ensure repo root is on PYTHONPATH for tests
    env["PYTHONPATH"] = str(ROOT)

    cmd = [sys.executable, "-m", "pytest", str(test_path), "-q", "-rA"]
    try:
        start = time.time()
        proc = subprocess.run(
            cmd,
            cwd=ROOT,
            env=env,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        duration = time.time() - start
        return {
            "success": proc.returncode == 0,
            "return_code": proc.returncode,
            "duration_seconds": duration,
            "stdout": proc.stdout,
            "stderr": proc.stderr,
        }
    except subprocess.TimeoutExpired:
        return {"success": False, "error": "pytest timed out", "timeout_seconds": timeout}


def quick_programmatic_check() -> Dict[str, Any]:
    """
    Import the implementation and run a simple forward check.
    Expects repository_after/switchablenorm.py to define SwitchableNorm2d.
    """
    try:
        import importlib.util

        impl_path = ROOT / "repository_after" / "switchablenorm.py"
        if not impl_path.exists():
            return {"ok": False, "error": f"{impl_path} not found"}

        spec = importlib.util.spec_from_file_location("switchablenorm", str(impl_path))
        module = importlib.util.module_from_spec(spec)
        assert spec.loader is not None
        spec.loader.exec_module(module)

        cls = getattr(module, "SwitchableNorm2d", None)
        if cls is None:
            return {"ok": False, "error": "SwitchableNorm2d class not found in repository_after/switchablenorm.py"}

        import torch

        model = cls(8)
        model.eval()
        x = torch.randn(2, 8, 6, 6)
        y = model(x)
        return {"ok": True, "out_shape": list(y.shape), "dtype": str(y.dtype)}
    except Exception as e:
        return {"ok": False, "error": str(e), "traceback": traceback.format_exc()}


def build_report() -> Dict[str, Any]:
    report: Dict[str, Any] = {}
    report["environment"] = get_env_info()

    print("1) Running pytest on tests/ ...")
    pytest_result = run_pytest()
    report["pytest"] = pytest_result
    if pytest_result.get("success"):
        print("   pytest: SUCCESS")
    else:
        print("   pytest: FAILURE or issues (see report)")

    # Print short previews
    stdout = pytest_result.get("stdout", "")
    stderr = pytest_result.get("stderr", "")
    if stdout:
        print("\n--- pytest stdout (first 20 lines) ---")
        for ln in stdout.splitlines()[:20]:
            print(ln)
        print("--- end pytest stdout preview ---")
    if stderr:
        print("\n--- pytest stderr (first 20 lines) ---")
        for ln in stderr.splitlines()[:20]:
            print(ln)
        print("--- end pytest stderr preview ---")

    print("\n2) Quick programmatic import + forward check ...")
    quick = quick_programmatic_check()
    report["quick_check"] = quick
    if quick.get("ok"):
        print(f"   quick_check: OK - output shape {quick.get('out_shape')} dtype={quick.get('dtype')}")
    else:
        print(f"   quick_check: FAILED - {quick.get('error')}")

    # Final summary
    report["summary"] = {
        "pytest_success": bool(pytest_result.get("success")),
        "quick_check_ok": bool(quick.get("ok")),
        "overall_success": bool(pytest_result.get("success")) and bool(quick.get("ok")),
    }

    return report


def save_report(report: Dict[str, Any], path: Path) -> None:
    # Ensure only report.json exists in reports dir
    if path.parent.exists():
        for f in path.parent.iterdir():
            try:
                if f.is_file():
                    f.unlink()
            except Exception:
                pass
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as fh:
        json.dump(report, fh, indent=2, default=str)


def main() -> int:
    print("Starting evaluation of SwitchableNorm2d implementation")
    start = datetime.now()
    report = build_report()
    end = datetime.now()
    report["duration_seconds"] = (end - start).total_seconds()

    out_path = REPORTS_DIR / "report.json"
    save_report(report, out_path)
    print(f"\nEvaluation report written to: {out_path}")
    print("Summary:")
    print(f"  PyTest passed: {report['summary']['pytest_success']}")
    print(f"  Quick import/forward passed: {report['summary']['quick_check_ok']}")
    print(f"  Overall success : {report['summary']['overall_success']}")
    return 0 if report["summary"]["overall_success"] else 1


if __name__ == "__main__":
    sys.exit(main())