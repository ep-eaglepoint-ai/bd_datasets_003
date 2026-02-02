#!/usr/bin/env python3
"""
Login Attempt Analyzer Evaluation Script

This script runs the test suite and generates a comprehensive JSON report
of the results, including both backend and frontend test outcomes.
"""

import subprocess
import json
import re
import sys
import os
from datetime import datetime
from pathlib import Path


class TestEvaluator:
    """Evaluates test results and generates structured reports."""
    
    def __init__(self):
        self.base_dir = Path(__file__).parent.parent
        self.evaluation_dir = Path(__file__).parent
        
    def run_tests(self):
        """Run the test suite directly and capture output."""
        print("🔍 Running Login Attempt Analyzer tests...")
        print("📋 Running tests directly...")
        
        try:
            # Run backend tests directly
            print("Running backend tests...")
            backend_process = subprocess.Popen(
                ["python", "-m", "pytest", "tests/backend/", "-v"],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                cwd=self.base_dir
            )
            
            backend_output_lines = []
            while True:
                line = backend_process.stdout.readline()
                if not line and backend_process.poll() is not None:
                    break
                if line:
                    backend_output_lines.append(line.strip())
                    print(line.strip())
            
            backend_return_code = backend_process.poll()
            
            print("\nRunning frontend tests...")
            
            # Run frontend tests directly
            frontend_process = subprocess.Popen(
                ["./node_modules/.bin/vitest", "run", "--reporter=verbose"],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                cwd=self.base_dir / "repository_after/frontend"
            )
            
            frontend_output_lines = []
            while True:
                line = frontend_process.stdout.readline()
                if not line and frontend_process.poll() is not None:
                    break
                if line:
                    frontend_output_lines.append(line.strip())
                    print(line.strip())
            
            frontend_return_code = frontend_process.poll()
            
            # Combine all output
            all_output = "\n".join(backend_output_lines + ["\n"] + frontend_output_lines)
            return_code = backend_return_code + frontend_return_code
            
            return all_output, return_code
            
        except Exception as e:
            print(f"❌ Error running tests: {e}")
            return "", 1
    
    def parse_test_results(self, output):
        """Parse test output to extract backend and frontend results."""
        
        # Backend test parsing (pytest)
        backend_results = {
            "total_tests": 0,
            "passed": 0,
            "failed": 0,
            "duration": 0,
            "tests": []
        }
        
        # Frontend test parsing (vitest)
        frontend_results = {
            "total_tests": 0,
            "passed": 0,
            "failed": 0,
            "duration": 0,
            "tests": []
        }
        
        lines = output.split('\n')
        current_section = None
        test_name_pattern = re.compile(r'tests/\w+/(test_\w+\.py::\w+|\w+\.spec\.ts)::(\w+)')
        
        for line in lines:
            # Detect section changes
            if "Running backend tests..." in line:
                current_section = "backend"
                continue
            elif "Running frontend tests..." in line:
                current_section = "frontend"
                continue
            
            # Parse backend pytest results
            if current_section == "backend":
                # Test result lines
                match = test_name_pattern.match(line)
                if match:
                    test_file, test_name = match.groups()
                    status = "PASSED" if "PASSED" in line else "FAILED"
                    
                    test_info = {
                        "name": f"{test_file}::{test_name}",
                        "status": status.lower(),
                        "duration": 0
                    }
                    backend_results["tests"].append(test_info)
                    
                    if status == "PASSED":
                        backend_results["passed"] += 1
                    else:
                        backend_results["failed"] += 1
                
                # Summary line
                if "= " in line and "passed" in line and "in" in line:
                    summary_match = re.search(r'(\d+)\s+passed', line)
                    if summary_match:
                        backend_results["total_tests"] = int(summary_match.group(1))
                        backend_results["passed"] = int(summary_match.group(1))
                    
                    # Extract duration
                    duration_match = re.search(r'in\s+([\d.]+)s', line)
                    if duration_match:
                        backend_results["duration"] = float(duration_match.group(1))
            
            # Parse frontend vitest results
            elif current_section == "frontend":
                # Test result lines
                if "✓" in line or "❯" in line:
                    # Extract test name
                    test_name = line.replace("✓", "").replace("❯", "").strip()
                    if test_name and not test_name.startswith("RUN") and not test_name.startswith("Test Files"):
                        status = "passed" if "✓" in line else "failed"
                        
                        test_info = {
                            "name": test_name,
                            "status": status,
                            "duration": 0
                        }
                        frontend_results["tests"].append(test_info)
                        
                        if status == "passed":
                            frontend_results["passed"] += 1
                        else:
                            frontend_results["failed"] += 1
                
                # Summary lines
                if "Test Files" in line and "passed" in line:
                    summary_match = re.search(r'Tests\s+(\d+)\s+passed', line)
                    if summary_match:
                        frontend_results["total_tests"] = int(summary_match.group(1))
                
                # Duration
                if "Duration" in line and "ms" in line:
                    duration_match = re.search(r'Duration\s+([\d.]+)ms', line)
                    if duration_match:
                        frontend_results["duration"] = float(duration_match.group(1)) / 1000  # Convert to seconds
        
        return backend_results, frontend_results
    
    def generate_report(self, backend_results, frontend_results, raw_output, return_code):
        """Generate the evaluation report."""
        
        # Create timestamped directory
        timestamp = datetime.now()
        timestamp_dir = self.evaluation_dir / timestamp.strftime("%Y-%m-%d") / timestamp.strftime("%H-%M-%S")
        timestamp_dir.mkdir(parents=True, exist_ok=True)
        
        # Generate report data
        report = {
            "metadata": {
                "timestamp": timestamp.isoformat(),
                "command": "docker compose run --rm test",
                "exit_code": return_code,
                "success": return_code == 0
            },
            "environment": {
                "python_version": sys.version,
                "platform": sys.platform
            },
            "results": {
                "backend": backend_results,
                "frontend": frontend_results,
                "summary": {
                    "total_tests": backend_results["total_tests"] + frontend_results["total_tests"],
                    "total_passed": backend_results["passed"] + frontend_results["passed"],
                    "total_failed": backend_results["failed"] + frontend_results["failed"],
                    "total_duration": backend_results["duration"] + frontend_results["duration"]
                }
            },
            "raw_output": raw_output
        }
        
        # Save report
        report_file = timestamp_dir / "report.json"
        with open(report_file, 'w') as f:
            json.dump(report, f, indent=2)
        
        return report, report_file
    
    def run_evaluation(self):
        """Run the complete evaluation process."""
        print("🚀 Starting Login Attempt Analyzer Evaluation")
        print("=" * 50)
        
        # Run tests
        raw_output, return_code = self.run_tests()
        
        # Parse results
        backend_results, frontend_results = self.parse_test_results(raw_output)
        
        # Generate report
        report, report_file = self.generate_report(backend_results, frontend_results, raw_output, return_code)
        
        # Print summary
        print("\n" + "=" * 50)
        print("📊 EVALUATION SUMMARY")
        print("=" * 50)
        
        summary = report["results"]["summary"]
        print(f"🧪 Total Tests: {summary['total_tests']}")
        print(f"✅ Passed: {summary['total_passed']}")
        print(f"❌ Failed: {summary['total_failed']}")
        print(f"⏱️  Duration: {summary['total_duration']:.2f}s")
        print(f"🎯 Success Rate: {(summary['total_passed'] / max(summary['total_tests'], 1)) * 100:.1f}%")
        
        print(f"\n📁 Report saved to: {report_file}")
        print(f"📂 Report directory: {report_file.parent}")
        
        return report


if __name__ == "__main__":
    evaluator = TestEvaluator()
    try:
        report = evaluator.run_evaluation()
        sys.exit(0 if report["metadata"]["success"] else 1)
    except KeyboardInterrupt:
        print("\n⚠️  Evaluation interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Evaluation failed: {e}")
        sys.exit(1)
