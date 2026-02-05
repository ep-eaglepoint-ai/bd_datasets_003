import os
import json
import subprocess
import time
import uuid
import platform
import tempfile
import shutil
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, Optional

# Define project root (assuming script is in /workspace/evaluation/)
ROOT = Path(__file__).parent.parent.resolve()
REPORTS = ROOT / "evaluation" / "reports"

def environment_info() -> Dict[str, str]:
    """Gather environment information."""
    return {
        "python_version": platform.python_version(),
        "platform": f"{platform.system()} {platform.release()}",
        "java_version": get_java_version()
    }

def get_java_version() -> str:
    """Get Java version."""
    try:
        result = subprocess.run(
            ["java", "-version"],
            capture_output=True,
            text=True,
            timeout=5
        )
        # Java version is often in stderr
        if result.stderr:
            return result.stderr.split('\n')[0].strip()
        return result.stdout.split('\n')[0].strip()
    except Exception:
        return "unknown"

def run_tests(repo_dir_name: str) -> Dict[str, Any]:
    """Run Java tests for a specific repository state (before/after)."""
    test_result = {
        "passed": False,
        "return_code": 1,
        "output": "",
        "tests_run": 0,
        "failures": 0,
        "errors": 0,
        "skipped": 0
    }
    
    repo_path = ROOT / repo_dir_name
    
    if not repo_path.exists():
        test_result["output"] = f"Repository path does not exist: {repo_path}"
        if repo_dir_name == "repository_before":
             # If before doesn't exist, we just consider it 'No tests run' but valid for baseline
             test_result["return_code"] = 0
             test_result["passed"] = True 
        return test_result
    
    # Check if there are java files to test
    if not list(repo_path.rglob("*.java")) and repo_dir_name == "repository_before":
         test_result["return_code"] = 0
         test_result["passed"] = True
         return test_result

    # Create temporary directory for isolation
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_root = Path(temp_dir)
        
        try:
            # 1. Copy source files
            files_to_compile = []
            
            # Copy source
            target_src = temp_root / "src"
            target_src.mkdir()
            
            if repo_path.exists():
                # Copy nested structure if needed, but for simplicity flatten or keep structure
                # The user's repo has src/com/fortress...
                # We should probably copy the whole src directory
                src_orig = repo_path / "src"
                if src_orig.exists():
                    shutil.copytree(src_orig, target_src, dirs_exist_ok=True)
                else:
                     # Fallback if flat
                     for f in repo_path.glob("*.java"):
                        shutil.copy(f, target_src)

            # 2. Copy tests
            target_tests = temp_root / "tests"
            target_tests.mkdir()
            source_tests = ROOT / "tests"
            
            if source_tests.exists():
                for f in source_tests.glob("*.java"):
                    shutil.copy(f, target_tests)
            
            # 3. Compile
            out_dir = temp_root / "out"
            out_dir.mkdir()
            
            # Find all java files
            src_files = list(target_src.rglob("*.java"))
            test_files = list(target_tests.rglob("*.java"))
            all_files = [str(f) for f in src_files + test_files]

            if not all_files:
                 test_result["output"] = "No Java files found to compile."
                 return test_result

            # Compile everything at once
            compile_cmd = ["javac", "-d", str(out_dir)] + all_files
            
            compile_proc = subprocess.run(
                compile_cmd,
                capture_output=True,
                text=True,
                timeout=60
            )
            
            if compile_proc.returncode != 0:
                test_result["output"] = f"Compilation Failed:\n{compile_proc.stderr}\n{compile_proc.stdout}"
                test_result["return_code"] = compile_proc.returncode
                return test_result

            # 4. Run Tests
            # Run TestRunner
            run_cmd = ["java", "-cp", str(out_dir), "TestRunner"]
            
            result = subprocess.run(
                run_cmd,
                capture_output=True,
                text=True,
                timeout=120
            )
            
            output = result.stdout + result.stderr
            test_result["return_code"] = result.returncode
            
            # Truncate output if too long
            if len(output) > 20000:
                output = output[:4000] + "\n...[truncated]...\n" + output[-16000:]
            
            test_result["output"] = output
            
            # Parse custom test output
            if "ALL TESTS PASSED" in output:
                 test_result["passed"] = True
                 test_result["failures"] = 0
            else:
                 test_result["passed"] = False
                 test_result["failures"] = 1 
                 
            # Heuristic for test count
            test_result["tests_run"] = output.count("Running test")
            
        except subprocess.TimeoutExpired:
            test_result["output"] = "Test execution timed out"
        except Exception as e:
            test_result["output"] = f"Test execution failed: {str(e)}"
    
    return test_result

def run_metrics(repo_path: Path) -> Dict[str, Any]:
    """Calculate complexity metrics for Java files."""
    metrics = {
        "java_file_count": 0,
        "lines_of_code": 0,
        "error": None
    }
    
    if not repo_path.exists():
        return metrics
    
    try:
        # Scan for Java files
        for java_file in repo_path.rglob("*.java"):
            # Exclude tests
            if "test" in str(java_file).lower():
                continue
                
            metrics["java_file_count"] += 1
            try:
                with open(java_file, 'r', encoding='utf-8', errors='ignore') as f:
                    lines = [l.strip() for l in f.readlines() if l.strip()]
                    metrics["lines_of_code"] += len(lines)
            except Exception:
                pass
    except Exception as e:
        metrics["error"] = str(e)
    
    return metrics

def evaluate(repo_name: str) -> Dict[str, Any]:
    return {
        "tests": run_tests(repo_name),
        "metrics": run_metrics(ROOT / repo_name)
    }

def print_report(report: Dict[str, Any], report_path: Path):
    print("=" * 60)
    print("EVALUATION RESULTS")
    print("=" * 60)
    print()
    print(f"Run ID: {report['run_id']}")
    print(f"Duration: {report['duration_seconds']:.2f} seconds")
    print()
    
    for stage in ["after"]:
        data = report[stage]
        tests = data["tests"]
        print(f"{stage.upper()} ({'repository_' + stage}):")
        print(f"  Tests passed: {tests['passed']}")
        print(f"  Tests run:    {tests['tests_run']}")
        print(f"  Failures:     {tests['failures']}")
        print(f"  Errors:       {tests['errors']}")
        print(f"  Files:        {data['metrics']['java_file_count']}")
        if not tests['passed']:
             print("  DEBUG OUTPUT:")
             print(tests.get('output', 'No output captured'))
        print()
    
    print("COMPARISON:")
    print(f"  Passed gate: {report['comparison']['passed_gate']}")
    print(f"  Summary:     {report['comparison']['improvement_summary']}")
    print()
    print("=" * 60)
    print(f"SUCCESS: {report['success']}")
    print("=" * 60)
    print(f"Report written to {report_path}")

def main():
    run_id = str(uuid.uuid4())
    start_time = time.time()
    
    print("Starting evaluation...")
    
    # 1. Evaluate 'repository_before' (Baseline)
    before = evaluate("repository_before")
    
    # 2. Evaluate 'repository_after' (Implementation)
    after = evaluate("repository_after")
    
    # 3. Determine success
    passed_gate = after["tests"]["passed"]
    
    comparison = {
        "passed_gate": passed_gate,
        "improvement_summary": "Tests passed" if passed_gate else "Tests failed",
        "before_passed": before["tests"]["passed"],
        "after_passed": after["tests"]["passed"]
    }
    
    duration = time.time() - start_time
    
    report = {
        "run_id": run_id,
        "timestamp": datetime.now().isoformat(),
        "duration_seconds": duration,
        "environment": environment_info(),
        "before": before,
        "after": after,
        "comparison": comparison,
        "success": passed_gate
    }
    
    # Save Report
    # Use strict path /evaluation/reports inside container, or simpler unique path
    # The script uses REPOS / ..
    
    date_str = datetime.now().strftime("%Y-%m-%d")
    time_str = datetime.now().strftime("%H-%M-%S")
    report_dir = REPORTS / date_str / time_str
    report_dir.mkdir(parents=True, exist_ok=True)
    
    report_path = report_dir / "report.json"
    with open(report_path, 'w') as f:
        json.dump(report, f, indent=2)
        
    print_report(report, report_path)
    
    exit(0 if report["success"] else 1)

if __name__ == "__main__":
    main()
