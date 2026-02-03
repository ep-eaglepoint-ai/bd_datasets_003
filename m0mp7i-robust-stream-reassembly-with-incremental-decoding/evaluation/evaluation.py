#!/usr/bin/env python3
"""
Evaluation script for Robust Stream Reassembly with Incremental Decoding.

This script:
1. Runs the test suite against the repository_after implementation
2. Generates a detailed report with metrics
"""

import subprocess
import sys
import os
from datetime import datetime
from io import StringIO
import unittest


def run_tests():
    """Run unittest and capture results."""
    test_path = os.path.join(os.path.dirname(__file__), '..', 'tests', 'test_stream_processor.py')
    
    # Determine which repository to use based on PYTHONPATH
    pythonpath = os.environ.get('PYTHONPATH', '')
    if 'repository_before' in pythonpath:
        # For repository_before, skip tests (no code exists)
        print("Running on repository_before - no implementation exists yet")
        return unittest.TestResult(), "No tests run on repository_before"
    
    # Create a test loader
    loader = unittest.TestLoader()
    suite = loader.discover(os.path.dirname(test_path), pattern='test_*.py')
    
    # Create a stream to capture output
    stream = StringIO()
    runner = unittest.TextTestRunner(stream=stream, verbosity=2)
    result = runner.run(suite)
    
    return result, stream.getvalue()


def generate_report(test_result, output):
    """Generate evaluation report."""
    report = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "status": "PASS" if test_result.wasSuccessful() else "FAIL",
        "tests_run": test_result.testsRun,
        "failures": len(test_result.failures),
        "errors": len(test_result.errors),
        "output": output,
        "summary": {
            "passed": test_result.testsRun - len(test_result.failures) - len(test_result.errors),
            "failed": len(test_result.failures),
            "errors": len(test_result.errors)
        }
    }
    
    return report


def main():
    """Main evaluation entry point."""
    print("=" * 60)
    print("Robust Stream Reassembly - Evaluation")
    print("=" * 60)
    print()
    
    print("Running test suite...")
    print("-" * 60)
    
    result, output = run_tests()
    
    # Print output
    print(output)
    
    print("-" * 60)
    
    # Generate report
    report = generate_report(result, output)
    
    # Print summary
    print(f"Tests Run: {report['tests_run']}")
    print(f"Tests Passed: {report['summary']['passed']}")
    print(f"Tests Failed: {report['summary']['failed']}")
    print(f"Errors: {report['summary']['errors']}")
    
    print()
    print("=" * 60)
    print(f"Overall Status: {report['status']}")
    print("=" * 60)
    
    # Return exit code
    return 0 if report["status"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
