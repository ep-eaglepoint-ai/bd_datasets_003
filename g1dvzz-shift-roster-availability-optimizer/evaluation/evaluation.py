
import json
import timeit
import random
import sys
import os

# Add path to allow imports
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from repository_before.staff_scheduler import StaffAggregator as StaffAggregatorBefore
from repository_after.staff_scheduler import StaffAggregator as StaffAggregatorAfter

def run_evaluation():
    print("Starting Evaluation...")
    results = {
        "requirements": {},
        "metrics": {}
    }
    
    # 1. Setup Data
    num_employees = 20000
    roles = [f"Role_{i}" for i in range(100)]
    employees = []
    for i in range(num_employees):
        employees.append({
            'name': f'Employee_{i}',
            'role': random.choice(roles),
            'on_duty': random.choice([True, False])
        })
    
    print("Initializing Aggregators...")
    # Initialize implementation
    before_agg = StaffAggregatorBefore(employees)
    after_agg = StaffAggregatorAfter(employees)
    target_role = 'Role_50'
    
    # 2. Verify Requirement 1: Dictionary Indexing
    # Check if 'role_map' exists in the optimized version
    has_map = hasattr(after_agg, 'role_map')
    results["requirements"]["req_1_dictionary_indexing"] = "PASS" if has_map else "FAIL"
    
    # 3. Verify Requirement 2: Sub-millisecond Response
    runs = 100
    t_after = timeit.timeit(lambda: after_agg.get_eligible_workers(target_role), number=runs)
    avg_after = t_after / runs
    
    # 4. Verify Requirement 3: 100x Speedup
    t_before = timeit.timeit(lambda: before_agg.get_eligible_workers(target_role), number=runs)
    avg_before = t_before / runs
    
    # Avoid division by zero
    start_speedup = avg_before / (avg_after if avg_after > 0 else 1e-9)
    
    results["metrics"]["avg_response_time_before_sec"] = avg_before
    results["metrics"]["avg_response_time_after_sec"] = avg_after
    results["metrics"]["speedup_factor"] = start_speedup
    
    if avg_before < 1e-6: avg_before = 1e-6 # Avoid div by zero in fail message if baseline is impossibly fast
    
    results["requirements"]["req_2_sub_millisecond"] = "PASS" if avg_after < 0.001 else "FAIL"
    results["requirements"]["req_3_100x_speedup"] = "PASS" if start_speedup > 100 else "FAIL"
    
    # 5. Verify Requirement 4: Correctness (Edge Cases & General)
    # Check general correctness against baseline
    res_before = sorted(before_agg.get_eligible_workers(target_role))
    res_after = sorted(after_agg.get_eligible_workers(target_role))
    is_correct_general = (res_before == res_after)
    
    # Check Edge Case: No Match
    res_none = after_agg.get_eligible_workers('NonExistentRole')
    is_correct_none = (res_none == [])
    
    results["requirements"]["req_4_correctness"] = "PASS" if (is_correct_general and is_correct_none) else "FAIL"
    
    # 6. Save Report
    # Ensure directory exists
    output_dir = os.path.dirname(__file__)
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        
    output_path = os.path.join(output_dir, 'evaluation_report.json')
    with open(output_path, 'w') as f:
        json.dump(results, f, indent=4)
    
    print(f"Evaluation Complete. Report saved to {output_path}")
    print(json.dumps(results, indent=4))

    # 7. Fail Build if any requirement is FAIL
    if "FAIL" in results["requirements"].values():
        print("\nFATAL: One or more requirements failed!")
        sys.exit(1)

if __name__ == "__main__":
    run_evaluation()
