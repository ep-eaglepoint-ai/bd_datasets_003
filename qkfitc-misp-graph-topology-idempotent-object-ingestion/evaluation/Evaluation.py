import unittest
import json
import time
import os
import sys
from datetime import datetime

def run_tests():
    loader = unittest.TestLoader()
    suite = loader.discover(start_dir=os.path.abspath(os.path.join(os.path.dirname(__file__), '../tests')), pattern='*_test.py')
    
    runner = unittest.TextTestRunner(verbosity=0)
    start_time = time.time()
    result = runner.run(suite)
    end_time = time.time()
    
    metrics = {
        "status": "pass" if result.wasSuccessful() else "fail",
        "tests_run": result.testsRun,
        "errors": len(result.errors),
        "failures": len(result.failures),
        "execution_time_seconds": round(end_time - start_time, 4),
        "details": []
    }
    
    for failure in result.failures:
        metrics["details"].append({"type": "failure", "test": str(failure[0]), "message": failure[1]})
    for error in result.errors:
        metrics["details"].append({"type": "error", "test": str(error[0]), "message": error[1]})
        
    return metrics

def main():
    print("Running evaluation...")
    metrics = run_tests()
    
    # Create timestamped report directory
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    report_dir = os.path.join(os.path.dirname(__file__), 'reports', timestamp)
    os.makedirs(report_dir, exist_ok=True)
    
    output_path = os.path.join(report_dir, 'report.json')
    with open(output_path, 'w') as f:
        json.dump(metrics, f, indent=4)
        
    print(f"Evaluation complete. Report saved to {output_path}")
    print(f"Status: {metrics['status']}")
    
    if metrics['status'] == 'fail':
        sys.exit(1)

if __name__ == "__main__":
    main()
