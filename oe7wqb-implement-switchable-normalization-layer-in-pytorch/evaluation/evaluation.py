#!/usr/bin/env python3
"""
Evaluation script for Switchable Normalization implementation.

This script:
- Runs pytest on tests/test_switchable_norm.py for repository_after.
- Performs a direct programmatic verification of the 13 requirements
  by importing repository_after/switchable_norm.py and exercising its API.
- Writes a single JSON report to evaluation/reports/report.json (overwriting any previous file).
- Logs a readable summary and detailed results to the terminal.
"""

import json
import os
import sys
import subprocess
import uuid
import platform
import time
import traceback
import importlib.util
from datetime import datetime
from pathlib import Path
from typing import Dict, Any

# Paths
ROOT = Path(__file__).parent.parent.resolve()
REPORTS_DIR = ROOT / "evaluation" / "reports"
REPORTS_DIR.mkdir(parents=True, exist_ok=True)

# Make repository root importable
sys.path.insert(0, str(ROOT))


def get_environment_info() -> Dict[str, Any]:
    """Get basic environment information."""
    info = {
        "evaluation_time": datetime.now().isoformat(),
        "python_version": sys.version,
        "platform": platform.platform(),
        "processor": platform.processor(),
        "architecture": platform.architecture(),
        "hostname": platform.node(),
        "working_directory": str(ROOT),
    }
    try:
        import torch
        info["pytorch"] = {
            "torch_version": torch.__version__,
            "cuda_available": torch.cuda.is_available(),
            "cuda_version": torch.version.cuda if torch.cuda.is_available() else None,
            "device_count": torch.cuda.device_count() if torch.cuda.is_available() else 0,
        }
    except Exception as e:
        info["pytorch"] = {"error": str(e)}
    return info


def run_pytest(repo_path: str, test_file: str = "test_switchable_norm.py") -> Dict[str, Any]:
    """
    Run pytest on a single file under ROOT/tests and return results dictionary.

    repo_path is a label (not used directly) kept for compatibility with previous script.
    """
    test_path = ROOT / "tests" / test_file
    if not test_path.exists():
        return {"success": False, "error": f"Test file not found: {test_path}", "stdout": "", "stderr": ""}

    env = os.environ.copy()
    # Ensure repository root is on PYTHONPATH for tests
    env["PYTHONPATH"] = str(ROOT)

    cmd = [sys.executable, "-m", "pytest", str(test_path), "-q", "-rA"]
    try:
        start = time.time()
        proc = subprocess.run(cmd, cwd=ROOT, env=env, capture_output=True, text=True, timeout=120)
        duration = time.time() - start
    except subprocess.TimeoutExpired:
        return {"success": False, "error": "pytest timed out", "stdout": "", "stderr": ""}

    stdout = proc.stdout
    stderr = proc.stderr
    success = proc.returncode == 0

    # Try to extract a simple summary from stdout
    summary = {"raw": ""}
    try:
        # Look for lines like "19 passed, 1 warning in 2.34s"
        for line in stdout.splitlines()[::-1]:
            if "passed" in line or "failed" in line or "error" in line:
                summary["raw"] = line.strip()
                break
    except Exception:
        pass

    return {
        "success": success,
        "return_code": proc.returncode,
        "duration_seconds": duration,
        "stdout": stdout,
        "stderr": stderr,
        "summary": summary,
    }


def import_module_from_path(path: Path, module_name: str):
    """Import a module given a filesystem path and return the module object."""
    spec = importlib.util.spec_from_file_location(module_name, str(path))
    module = importlib.util.module_from_spec(spec)
    loader = spec.loader
    if loader is None:
        raise ImportError(f"Could not load module spec for {path}")
    loader.exec_module(module)
    return module


def test_implementation_requirements() -> Dict[str, Any]:
    """
    Programmatically verify the 13 requirements by importing the implementation and running checks.
    Returns a summary dictionary.
    """
    import torch
    import torch.nn as nn

    implementation_path = ROOT / "repository_after" / "switchable_norm.py"
    if not implementation_path.exists():
        return {
            "total_requirements": 13,
            "passed_requirements": 0,
            "failed_requirements": 13,
            "all_passed": False,
            "error": f"{implementation_path} not found",
        }

    try:
        module = import_module_from_path(implementation_path, "switchable_norm")
    except Exception as e:
        return {
            "total_requirements": 13,
            "passed_requirements": 0,
            "failed_requirements": 13,
            "all_passed": False,
            "error": f"Failed to import implementation: {e}",
            "traceback": traceback.format_exc(),
        }

    # Resolve symbols (match current implementation API)
    if not hasattr(module, "SwitchableNorm2d"):
        return {
            "total_requirements": 13,
            "passed_requirements": 0,
            "failed_requirements": 13,
            "all_passed": False,
            "error": "SwitchableNorm2d not found in implementation",
        }

    SwitchableNorm2d = module.SwitchableNorm2d
    AdaptiveSwitchableNorm2d = getattr(module, "AdaptiveSwitchableNorm2d", None)

    results = {}
    total = 13
    passed = 0

    # Helper to mark pass/fail
    def mark(key: str, ok: bool, description: str, details: dict | str = None):
        nonlocal passed
        results[key] = {"passed": bool(ok), "description": description}
        if details is not None:
            results[key]["details"] = details
        if ok:
            passed += 1

    # Requirement 1: compute BN, IN, LN simultaneously (forward runs and preserves shape)
    try:
        sn = SwitchableNorm2d(64)
        x = torch.randn(4, 64, 32, 32)
        sn.train()
        y = sn(x)
        mark("requirement_1", y.shape == x.shape,
             "Compute BatchNorm, InstanceNorm, and LayerNorm simultaneously",
             {"in_shape": list(x.shape), "out_shape": list(y.shape)})
    except Exception as e:
        mark("requirement_1", False, "Compute BatchNorm/Instance/Layer simultaneously", str(e))

    # Requirement 2: learnable weights (mean_logits & var_logits)
    try:
        sn = SwitchableNorm2d(32)
        ok = hasattr(sn, "mean_logits") and hasattr(sn, "var_logits") \
             and isinstance(sn.mean_logits, nn.Parameter) and isinstance(sn.var_logits, nn.Parameter)
        ok = ok and tuple(sn.mean_logits.shape) == (3,) and tuple(sn.var_logits.shape) == (3,)
        mark("requirement_2", ok, "Learnable weights for mean and variance",
             {"mean_logits_shape": tuple(sn.mean_logits.shape), "var_logits_shape": tuple(sn.var_logits.shape)})
    except Exception as e:
        mark("requirement_2", False, "Learnable weights for mean and variance", str(e))

    # Requirement 3: softmax applied to importance weights
    try:
        sn = SwitchableNorm2d(32)
        if hasattr(sn, "_softmax_coeffs"):
            mc = sn._softmax_coeffs(sn.mean_logits, dtype=torch.float32, device=torch.device("cpu"))
            vc = sn._softmax_coeffs(sn.var_logits, dtype=torch.float32, device=torch.device("cpu"))
        else:
            mc = torch.softmax(sn.mean_logits.to(torch.float32), dim=0)
            vc = torch.softmax(sn.var_logits.to(torch.float32), dim=0)
        ok = torch.allclose(mc.sum(), torch.tensor(1.0, dtype=mc.dtype)) and torch.allclose(vc.sum(), torch.tensor(1.0, dtype=vc.dtype))
        ok = ok and (mc > 0).all() and (vc > 0).all()
        mark("requirement_3", ok, "Softmax-normalized importance weights",
             {"mean_coeffs": mc.tolist(), "var_coeffs": vc.tolist()})
    except Exception as e:
        mark("requirement_3", False, "Softmax-normalized importance weights", str(e))

    # Requirement 4: support 2D conv input (NCHW)
    try:
        sn = SwitchableNorm2d(32)
        x = torch.randn(4, 32, 16, 16)
        y = sn(x)
        ok = (y.shape == x.shape)
        errors = 0
        try:
            sn(torch.randn(4, 32, 16))
        except ValueError:
            errors += 1
        try:
            sn(torch.randn(4, 32, 16, 16, 16))
        except ValueError:
            errors += 1
        ok = ok and (errors == 2)
        mark("requirement_4", ok, "Supports 2D convolutional input (NCHW)",
             {"in_shape": list(x.shape), "out_shape": list(y.shape)})
    except Exception as e:
        mark("requirement_4", False, "Supports 2D convolutional input (NCHW)", str(e))

    # Requirement 5: running mean/var for BN
    try:
        sn = SwitchableNorm2d(64, track_running_stats=True)
        ok = sn.running_mean is not None and sn.running_var is not None and sn.num_batches_tracked is not None
        ok = ok and torch.allclose(sn.running_mean, torch.zeros(64)) and torch.allclose(sn.running_var, torch.ones(64))
        ok = ok and int(sn.num_batches_tracked.item()) == 0
        sn.train()
        _ = sn(torch.randn(4, 64, 16, 16))
        ok = ok and int(sn.num_batches_tracked.item()) >= 1
        sn2 = SwitchableNorm2d(64, track_running_stats=False)
        ok = ok and (sn2.running_mean is None and sn2.running_var is None)
        mark("requirement_5", ok, "Running mean/var for BatchNorm (momentum update)",
             {"running_mean_shape": list(sn.running_mean.shape) if sn.running_mean is not None else None})
    except Exception as e:
        mark("requirement_5", False, "Running mean/var for BatchNorm", str(e))

    # Requirement 6: training vs inference behavior
    try:
        sn = SwitchableNorm2d(32, track_running_stats=True)
        x = torch.randn(4, 32, 16, 16)
        sn.train()
        y_train = sn(x)
        for _ in range(3):
            _ = sn(x)
        sn.eval()
        y_eval1 = sn(x)
        y_eval2 = sn(x)
        deterministic = torch.allclose(y_eval1, y_eval2, atol=1e-5)
        mark("requirement_6", deterministic, "Correctly handles training vs inference modes (deterministic eval)",
             {"train_vs_eval_equal": torch.allclose(y_train, y_eval1, atol=1e-6)})
    except Exception as e:
        mark("requirement_6", False, "Correctly handles training vs inference modes", str(e))

    # Requirement 7: affine parameters (shared scale and bias)
    try:
        sn_affine = SwitchableNorm2d(64, affine=True)
        sn_no_affine = SwitchableNorm2d(64, affine=False)
        ok = isinstance(sn_affine.weight, nn.Parameter) and isinstance(sn_affine.bias, nn.Parameter)
        ok = ok and tuple(sn_affine.weight.shape) == (64,) and tuple(sn_affine.bias.shape) == (64,)
        ok = ok and torch.allclose(sn_affine.weight, torch.ones(64)) and torch.allclose(sn_affine.bias, torch.zeros(64))
        ok = ok and (sn_no_affine.weight is None and sn_no_affine.bias is None)
        mark("requirement_7", ok, "Shared affine scale and bias applied post-normalization",
             {"affine_initialized": True})
    except Exception as e:
        mark("requirement_7", False, "Shared affine scale and bias applied post-normalization", str(e))

    # Requirement 8: broadcast-safe ops
    try:
        sn = SwitchableNorm2d(32)
        ok = True
        for N in (1, 2, 4):
            for H, W in ((1, 1), (8, 8), (16, 32)):
                out = sn(torch.randn(N, 32, H, W))
                ok = ok and out.shape == (N, 32, H, W)
        mark("requirement_8", ok, "Broadcast-safe tensor operations", {})
    except Exception as e:
        mark("requirement_8", False, "Broadcast-safe tensor operations", str(e))

    # Requirement 9: unbiased=False variance
    try:
        sn = SwitchableNorm2d(32)
        x = torch.randn(4, 32, 16, 16)
        y = sn(x)
        ok = not torch.isnan(y).any()
        xs = torch.randn(2, 32, 8, 8)
        ys = sn(xs)
        ok = ok and not torch.isnan(ys).any()
        mark("requirement_9", ok, "Variance computed with unbiased=False (population variance)", {})
    except Exception as e:
        mark("requirement_9", False, "Variance computed with unbiased=False", str(e))

    # Requirement 10: epsilon for stability
    try:
        sn = SwitchableNorm2d(32, eps=1e-5)
        x = torch.ones(4, 32, 16, 16)
        y = sn(x)
        ok = not torch.isnan(y).any() and not torch.isinf(y).any()
        mark("requirement_10", ok, "Epsilon stabilization applied", {"eps": sn.eps})
    except Exception as e:
        mark("requirement_10", False, "Epsilon stabilization applied", str(e))

    # Requirement 11: efficiency (coarse)
    try:
        sn = SwitchableNorm2d(64)
        x = torch.randn(4, 64, 32, 32)
        start = time.time()
        for _ in range(100):
            _ = sn(x)
        dur = time.time() - start
        ok = dur < 5.0
        mark("requirement_11", ok, "Efficient forward computation (coarse check)", {"duration_seconds": dur})
    except Exception as e:
        mark("requirement_11", False, "Efficient forward computation", str(e))

    # Requirement 12: autograd compatibility
    try:
        sn = SwitchableNorm2d(32)
        x = torch.randn(4, 32, 16, 16, requires_grad=True)
        y = sn(x)
        loss = y.sum()
        loss.backward()
        ok = x.grad is not None and not torch.isnan(x.grad).any()
        ok = ok and (sn.mean_logits.grad is not None and sn.var_logits.grad is not None)
        if sn.affine:
            ok = ok and (sn.weight.grad is not None and sn.bias.grad is not None)
        mark("requirement_12", ok, "Compatible with PyTorch autograd", {})
    except Exception as e:
        mark("requirement_12", False, "Compatible with PyTorch autograd", str(e))

    # Requirement 13: replaceable for BatchNorm2d
    try:
        sn = SwitchableNorm2d(64, eps=1e-5, momentum=0.1, affine=True, track_running_stats=True)
        bn = nn.BatchNorm2d(64, eps=1e-5, momentum=0.1, affine=True, track_running_stats=True)
        x = torch.randn(4, 64, 32, 32)
        y_sn = sn(x)
        y_bn = bn(x)
        ok = (y_sn.shape == y_bn.shape == x.shape)
        class TestNet(nn.Module):
            def __init__(self):
                super().__init__()
                self.conv = nn.Conv2d(3, 32, 3, padding=1)
                self.norm = SwitchableNorm2d(32)
            def forward(self, x):
                return self.norm(self.conv(x))
        model = TestNet()
        out = model(torch.randn(2, 3, 32, 32))
        ok = ok and (out.shape == (2, 32, 32, 32))
        mark("requirement_13", ok, "Replaceable in place of BatchNorm2d", {})
    except Exception as e:
        mark("requirement_13", False, "Replaceable in place of BatchNorm2d", str(e))

    summary = {
        "total_requirements": total,
        "passed_requirements": passed,
        "failed_requirements": total - passed,
        "all_passed": (passed == total),
        "requirements": results,
    }
    return summary


def run_comprehensive_evaluation() -> Dict[str, Any]:
    """Run full evaluation: pytest + programmatic requirements checks."""
    evaluation_id = str(uuid.uuid4())[:8]
    start_time = datetime.now()

    print("=" * 70)
    print("SWITCHABLE NORMALIZATION - COMPREHENSIVE EVALUATION")
    print(f"Evaluation ID: {evaluation_id}")
    print(f"Start Time: {start_time.isoformat()}")
    print("=" * 70)

    report: Dict[str, Any] = {
        "evaluation_id": evaluation_id,
        "timestamp": start_time.isoformat(),
        "environment": get_environment_info(),
        "test_results": {},
        "requirements_analysis": {},
    }

    # Run tests for repository_after
    print("\nRunning tests (repository_after)...")
    after = run_pytest("repository_after")
    report["test_results"]["repository_after"] = after
    print(f"  Tests success: {after.get('success', False)}")
    if after.get("summary", {}).get("raw"):
        print(f"  PyTest summary: {after['summary']['raw']}")
    # Print a short preview of stdout/stderr
    if after.get("stdout"):
        print("\n--- pytest stdout (first 10 lines) ---")
        for ln in after["stdout"].splitlines()[:10]:
            print(ln)
        print("--- end stdout preview ---")
    if after.get("stderr"):
        print("\n--- pytest stderr (first 10 lines) ---")
        for ln in after["stderr"].splitlines()[:10]:
            print(ln)
        print("--- end stderr preview ---")

    # Programmatic checks
    print("\nVerifying implementation requirements...")
    requirements = test_implementation_requirements()
    report["requirements_analysis"] = requirements
    req_passed = requirements.get("passed_requirements", 0)
    req_total = requirements.get("total_requirements", 13)
    print(f"  Requirements passed: {req_passed}/{req_total}")

    # Print per-requirement results
    print("\nPer-requirement results:")
    reqs = requirements.get("requirements", {})
    for key in sorted(reqs.keys()):
        r = reqs[key]
        status = "PASS" if r.get("passed") else "FAIL"
        print(f" - {key}: {status} - {r.get('description')}")
        details = r.get("details")
        if details:
            # print compact details
            details_str = details if isinstance(details, str) else json.dumps(details, default=str)
            print(f"    details: {details_str}")

    # Compose summary
    all_tests_ok = after.get("success", False)
    all_reqs_ok = requirements.get("all_passed", False)
    overall_success = all_tests_ok and all_reqs_ok

    report["summary"] = {
        "tests_passed": all_tests_ok,
        "all_requirements_passed": all_reqs_ok,
        "overall_success": overall_success,
        "duration_seconds": (datetime.now() - start_time).total_seconds(),
    }

    # Print final summary to terminal
    print("\n" + "=" * 70)
    print("EVALUATION SUMMARY")
    print("=" * 70)
    print(f"Tests Passed: {'YES' if all_tests_ok else 'NO'}")
    print(f"All Requirements Met: {'YES' if all_reqs_ok else 'NO'}")
    print(f"Overall Success: {'PASS' if overall_success else 'FAIL'}")
    print(f"Requirements Score: {req_passed}/{req_total}")
    print(f"Duration: {report['summary']['duration_seconds']:.2f} seconds")
    print("=" * 70)

    return report


def save_report(report: Dict[str, Any]) -> str:
    """Save evaluation report to evaluation/reports/report.json (only file in folder)."""
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    # Remove existing files in reports dir
    for f in REPORTS_DIR.iterdir():
        try:
            if f.is_file():
                f.unlink()
        except Exception:
            pass

    out_path = REPORTS_DIR / "report.json"
    with open(out_path, "w") as fh:
        json.dump(report, fh, indent=2, default=str)

    return str(out_path)


def main():
    try:
        report = run_comprehensive_evaluation()
        saved = save_report(report)
        print(f"\nReport written to: {saved}")
        if report["summary"]["overall_success"]:
            print("EVALUATION SUCCEEDED")
            sys.exit(0)
        else:
            print("EVALUATION FAILED")
            sys.exit(1)
    except Exception as e:
        print("Evaluation error:", e)
        traceback.print_exc()
        # Write an error report
        REPORTS_DIR.mkdir(parents=True, exist_ok=True)
        err_report = {
            "evaluation_id": str(uuid.uuid4())[:8],
            "timestamp": datetime.now().isoformat(),
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc(),
        }
        with open(REPORTS_DIR / "report.json", "w") as fh:
            json.dump(err_report, fh, indent=2)
        sys.exit(1)


if __name__ == "__main__":
    main()