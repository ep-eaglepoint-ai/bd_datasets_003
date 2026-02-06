import sys
import os
import random
import string
import time
from datetime import datetime

# Ensure we can import from repository_after and tests directory
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from repository_after.report_generator import ReportGenerator as OptimizedReportGenerator
from tests.reference_report_generator import ReportGenerator as OriginalReportGenerator
from tests.test_baseline import assert_identical_output as assert_report_identical
from tests.test_sanitize import assert_sanitize_identical
from tests.test_analyze import assert_stats_identical

def test_stress_large_report():
    print("Testing stress large report...")
    # Generate 1000 rows
    headers = ["ID", "Name", "Value", "Description", "Extra"]
    rows = [[str(i), f"User_{i}", f"{random.randint(1, 1000)}", "Desc "*5, "Info"] for i in range(1000)]
    
    # Generate 1000 list items
    items = [f"Item_{i} - {random.randint(1, 100)}" for i in range(1000)]
    
    # Generate large summary
    summary_data = {f"Key_{i}": f"Value_{i}" for i in range(500)}
    
    input_data = {
        'header': {
            'title': 'STRESS TEST REPORT', 
            'date': datetime.now()
        },
        'footer': {
            'author': 'StressTester',
            'page_count': 9999
        },
        'sections': [
            {'type': 'text', 'content': "Start of large report..."},
            {
                'type': 'table', 
                'headers': headers, 
                'rows': rows,
                'col_width': 20
            },
            {
                'type': 'summary',
                'data': summary_data
            },
            {
                'type': 'list',
                'title': 'Huge List',
                'items': items,
                'numbered': True
            },
            {'type': 'text', 'content': "End of large report."}
        ]
    }
    
    start_time = time.time()
    assert_report_identical(input_data, optimized_cls=OptimizedReportGenerator)
    elapsed = time.time() - start_time
    print(f"Stress large report verified in {elapsed:.4f}s.")

def test_stress_sanitize():
    print("Testing stress sanitize...")
    # Generate 100KB string
    text = "".join(random.choices(string.ascii_letters + " ", k=100000))
    replacements = {
        "aa": "AA",
        "bb": "BB", 
        "cc": "CC",
        "hello": "HELLO",
        "world": "WORLD"
    }
    
    start_time = time.time()
    assert_sanitize_identical(text, replacements)
    elapsed = time.time() - start_time
    print(f"Stress sanitize verified in {elapsed:.4f}s.")

def test_stress_analyze():
    print("Testing stress analyze...")
    # Generate 100KB string with mixed content
    chars = string.ascii_letters + string.digits + " \n\t!@#$%^&*()"
    text = "".join(random.choices(chars, k=100000))
    
    start_time = time.time()
    assert_stats_identical(text)
    elapsed = time.time() - start_time
    print(f"Stress analyze verified in {elapsed:.4f}s.")

if __name__ == "__main__":
    try:
        test_stress_large_report()
        test_stress_sanitize()
        test_stress_analyze()
        print("All final verification stress tests passed!")
    except AssertionError as e:
        print(f"Final verification failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    except Exception as e:
        print(f"An error occurred: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
