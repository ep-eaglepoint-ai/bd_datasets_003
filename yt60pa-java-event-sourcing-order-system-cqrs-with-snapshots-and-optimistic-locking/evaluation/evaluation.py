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

def run_tests(repo_path: Path) -> Dict[str, Any]:
    """Run Maven tests for a specific repository state (before/after)."""
    test_result = {
        "passed": False,
        "return_code": 1,
        "output": "",
        "tests_run": 0,
        "failures": 0,
        "errors": 0,
        "skipped": 0
    }
    
    if not repo_path.exists():
        test_result["output"] = f"Repository path does not exist: {repo_path}"
        return test_result
    
    # Create temporary directory for isolation
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_root = Path(temp_dir)
        
        try:
            # 1. Prepare 'repository_after' directory in temp
            # We name it 'repository_after' regardless of source to match pom.xml expectation
            target_repo_dir = temp_root / "repository_after"
            if repo_path.exists():
                shutil.copytree(repo_path, target_repo_dir)
            else:
                target_repo_dir.mkdir()

            # 2. Ensure pom.xml exists
            # We use the working pom.xml from the actual repository_after
            source_pom = ROOT / "repository_after" / "pom.xml"
            target_pom = target_repo_dir / "pom.xml"
            
            if source_pom.exists() and not target_pom.exists():
                shutil.copy(source_pom, target_pom)

            # 3. Copy tests to sibling directory
            # Structure required:
            #   temp_root/
            #     repository_after/  (source + pom)
            #     tests/             (test file)
            target_tests_dir = temp_root / "tests"
            source_tests_dir = ROOT / "tests"
            
            if source_tests_dir.exists():
                shutil.copytree(source_tests_dir, target_tests_dir)

        except Exception as e:
            test_result["output"] = f"Failed to prepare test environment: {str(e)}"
            return test_result
        
        # 4. Construct Maven command
        # We run from temp_root. 
        # -f points to the pom. 
        # pom has <testSourceDirectory>../tests/src/test/java</testSourceDirectory> which resolves correctly.
        cmd = [
            "mvn",
            "-f", "repository_after/pom.xml",
            "-Dtest=TestRequirements", # Explicitly target the test class
            "-Dmaven.test.failure.ignore=true",
            "-Dsurefire.useFile=false",
            "-DredirectTestOutputToFile=false",
            "-DtrimStackTrace=false",
            "clean",
            "test"
        ]
        
        try:
            result = subprocess.run(
                cmd,
                cwd=temp_root,
                capture_output=True,
                text=True,
                timeout=240
            )
            
            output = result.stdout + result.stderr
            test_result["return_code"] = result.returncode
            
            # Truncate output if too long
            if len(output) > 20000:
                output = output[:4000] + "\n...[truncated]...\n" + output[-16000:]
            
            test_result["output"] = output
            
            # Parse Surefire reports (XML)
            report_dir = target_repo_dir / "target" / "surefire-reports"
            stats = parse_surefire_reports(report_dir)
            
            # Fallback to console parsing
            if stats["tests_run"] == 0:
                stats = parse_maven_output(output)
            
            test_result.update(stats)

            # Determine Pass/Fail (Failures + Errors must be 0, at least 1 test run)
            test_result["passed"] = (
                test_result["tests_run"] > 0 and
                test_result["failures"] == 0 and
                test_result["errors"] == 0
            )
            
        except subprocess.TimeoutExpired:
            test_result["output"] = "Test execution timed out after 240 seconds"
        except Exception as e:
            test_result["output"] = f"Test execution failed: {str(e)}"
    
    return test_result

def parse_maven_output(output: str) -> Dict[str, int]:
    """Parse Maven console output for test stats."""
    stats = {"tests_run": 0, "failures": 0, "errors": 0, "skipped": 0}
    for line in output.split('\n'):
        if "Tests run:" in line:
            try:
                # Example: [INFO] Tests run: 5, Failures: 0, Errors: 0, Skipped: 0
                parts = line.split(',')
                for part in parts:
                    clean_part = part.strip()
                    if "Tests run:" in clean_part:
                        stats["tests_run"] = int(clean_part.split(':')[1].strip())
                    elif "Failures:" in clean_part:
                        stats["failures"] = int(clean_part.split(':')[1].strip())
                    elif "Errors:" in clean_part:
                        stats["errors"] = int(clean_part.split(':')[1].strip())
                    elif "Skipped:" in clean_part:
                        stats["skipped"] = int(clean_part.split(':')[1].strip())
            except (ValueError, IndexError):
                pass
    return stats

def parse_surefire_reports(report_dir: Path) -> Dict[str, int]:
    """Parse XML reports generated by Maven Surefire."""
    stats = {"tests_run": 0, "failures": 0, "errors": 0, "skipped": 0}
    if not report_dir.exists():
        return stats
    
    try:
        import xml.etree.ElementTree as ET
        for xml_file in report_dir.glob("TEST-*.xml"):
            try:
                tree = ET.parse(xml_file)
                root = tree.getroot()
                
                # Try attributes first
                tests = root.attrib.get("tests")
                failures = root.attrib.get("failures")
                errors = root.attrib.get("errors")
                skipped = root.attrib.get("skipped")
                
                if tests: stats["tests_run"] += int(tests)
                if failures: stats["failures"] += int(failures)
                if errors: stats["errors"] += int(errors)
                if skipped: stats["skipped"] += int(skipped)
            except Exception:
                continue
    except Exception:
        pass
        
    return stats

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
    repo_path = ROOT / repo_name
    return {
        "tests": run_tests(repo_path),
        "metrics": run_metrics(repo_path)
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
        print(f"  LOC:          {data['metrics']['lines_of_code']}")
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
    
    # 1. Evaluate 'repository_before' (Baseline - empty for this project)
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
