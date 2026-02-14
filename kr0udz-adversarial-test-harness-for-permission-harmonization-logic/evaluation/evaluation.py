import sys
import os
import json
import time
import pytest
from datetime import datetime

# Add root to path
sys.path.append(os.getcwd())

from repository_after.app import run_harness
from repository_after.harmonize import harmonize_permissions

def run_evaluation():
    start_time = time.time()
    
    # 1. Run the Harness against the Correct Implementation
    print("Running Harness against Reference Implementation...")
    harness_result = run_harness(harmonize_permissions, seed=42, n=1000, m_docs=50, k_users=50)
    
    # 2. Run Meta-Tests using pytest
    print("Running Meta-Tests...")
    # Capture pytest output?
    # We'll just run pytest via module invocation
    class Plugin:
        def pytest_sessionfinish(self, session, exitstatus):
            self.exitstatus = exitstatus
            self.passed = exitstatus == 0
            
    plugin = Plugin()
    ret_code = pytest.main(["-q", "tests"], plugins=[plugin])
    
    end_time = time.time()
    duration = end_time - start_time
    
    success = (harness_result["status"] == "PASSED") and (ret_code == 0)
    
    metrics = {
        "timestamp": datetime.now().isoformat(),
        "execution_time_seconds": duration,
        "harness_status_reference": harness_result["status"],
        "meta_tests_passed": (ret_code == 0),
        "overall_success": success,
        "harness_metrics": harness_result
    }
    
    # Write report
    os.makedirs("evaluation", exist_ok=True)
    with open("evaluation/report.json", "w") as f:
        json.dump(metrics, f, indent=2)
        
    print(json.dumps(metrics, indent=2))
    
    if not success:
        sys.exit(1)

if __name__ == "__main__":
    run_evaluation()
