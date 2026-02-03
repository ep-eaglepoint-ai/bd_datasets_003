#!/usr/bin/env python3
import sys
import re
import json
import uuid
import platform
import os
import subprocess
from pathlib import Path
from datetime import datetime

ROOT = Path("/app")  # Docker path
REPORTS = ROOT / "evaluation" / "reports"

def environment_info():
    return {
        "python_version": platform.python_version(),
        "platform": platform.platform()
    }

def run_tests(context_path=None):
    include_path = context_path if context_path else ROOT / "repository_after"
    test_file = ROOT / "tests" / "test_avl.cpp"
    executable = ROOT / "test_avl_app"
    
    if not include_path.exists():
         return {
            "passed": False,
            "return_code": -1,
            "output": f"Include path {include_path} does not exist"
        }

    try:
        # 1. Compile
        compile_cmd = [
            "g++", "-std=c++17", 
            str(test_file), 
            "-o", str(executable), 
            f"-I{include_path}" 
        ]
        
        # Read test content and fix include if needed
        test_content = test_file.read_text()
        test_content_fixed = test_content.replace('../repository_after/avl_tree.h', 'avl_tree.h')
        
        temp_test_file = ROOT / "tests" / "temp_test_avl.cpp"
        temp_test_file.write_text(test_content_fixed)
        
        compile_cmd[2] = str(temp_test_file)
        
        comp_proc = subprocess.run(
            compile_cmd,
            capture_output=True,
            text=True,
            timeout=60
        )
        
        if comp_proc.returncode != 0:
            return {
                "passed": False,
                "return_code": comp_proc.returncode,
                "output": f"Compilation failed:\n{comp_proc.stderr}\n{comp_proc.stdout}"
            }
            
        # 2. Run
        run_proc = subprocess.run(
            [str(executable)],
            capture_output=True,
            text=True,
            timeout=60
        )
        
        output = run_proc.stdout + run_proc.stderr
        
        return {
            "passed": run_proc.returncode == 0,
            "return_code": run_proc.returncode,
            "output": output
        }
        
    except Exception as e:
        return {
            "passed": False,
            "return_code": -1,
            "output": str(e)
        }
    finally:
        if os.path.exists(executable):
            os.remove(executable)
        if os.path.exists(temp_test_file):
            os.remove(temp_test_file)

def run_metrics(repo_path: Path):
    metrics = {
        "file_count": 0,
        "lines_of_code": 0,
        "struct_count_approx": 0
    }
    
    if not repo_path.exists():
        return metrics

    try:
        for file_path in repo_path.rglob("*.h"):
            metrics["file_count"] += 1
            try:
                content = file_path.read_text(encoding="utf-8", errors="ignore")
                lines = content.splitlines()
                metrics["lines_of_code"] += len(lines)
                metrics["struct_count_approx"] += sum(1 for line in lines if "struct " in line or "class " in line)
            except Exception:
                pass
    except Exception as e:
        metrics["error"] = str(e)
        
    return metrics

def evaluate(repo_name: str):
    repo_path = ROOT / repo_name
    
    tests = run_tests(repo_path)
    metrics = run_metrics(repo_path)
    return {
        "tests": tests,
        "metrics": metrics
    }

def run_evaluation():
    run_id = str(uuid.uuid4())
    start = datetime.utcnow()
    
    # Only evaluate repository_after
    after = evaluate("repository_after")
    
    comparison = {
        "passed_gate": after["tests"]["passed"],
        "improvement_summary": "Implemented AVL Tree passes all tests."
    }
    
    end = datetime.utcnow()
    
    return {
        "run_id": run_id,
        "started_at": start.isoformat() + "Z",
        "finished_at": end.isoformat() + "Z",
        "duration_seconds": (end - start).total_seconds(),
        "environment": environment_info(),
        "after": after,
        "comparison": comparison,
        "success": comparison["passed_gate"],
        "error": None
    }

def print_report(report, report_path):
    print("=" * 60)
    print("EVALUATION RESULTS")
    print("=" * 60)
    print()
    print(f"Run ID: {report['run_id']}")
    print(f"Duration: {report['duration_seconds']:.2f} seconds")
    print()
    print("AFTER (repository_after):")
    print(f"  Tests passed: {report['after']['tests']['passed']}")
    print(f"  Output snippet: {report['after']['tests']['output'][:200]}...")
    print()
    print("=" * 60)
    print(f"SUCCESS: {report['success']}")
    print("=" * 60)
    print()
    print(f"Report written to {report_path}")

def main():
    report = run_evaluation()
    
    # Generate report path: evaluation/reports/YYYY-MM-DD/HH-MM-SS/report.json
    now = datetime.strptime(report["started_at"].replace("Z", ""), "%Y-%m-%dT%H:%M:%S.%f")
    date_str = now.strftime("%Y-%m-%d")
    time_str = now.strftime("%H-%M-%S")
    
    report_dir = REPORTS / date_str / time_str
    report_dir.mkdir(parents=True, exist_ok=True)
    
    path = report_dir / "report.json"
    path.write_text(json.dumps(report, indent=2))
    
    print_report(report, path)
    return 0 if report["success"] else 1

if __name__ == "__main__":
    sys.exit(main())
