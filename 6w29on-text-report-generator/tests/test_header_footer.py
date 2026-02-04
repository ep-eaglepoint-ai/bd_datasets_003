import sys
import os
from datetime import datetime

# Ensure we can import from repository_after and tests directory
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from repository_after.report_generator import ReportGenerator as OptimizedReportGenerator
from tests.test_baseline import assert_identical_output

def test_header_refactoring():
    print("Testing set_header refactoring...")
    input_data = {
        'header': {
            'title': 'Optimization Report', 
            'date': datetime(2023, 10, 27, 9, 30, 0)
        },
        'sections': []
    }
    assert_identical_output(input_data, optimized_cls=OptimizedReportGenerator)
    print("set_header refactoring match confirmed.")

def test_footer_refactoring():
    print("Testing set_footer refactoring...")
    input_data = {
        'footer': {
            'author': 'Refactoring Agent',
            'page_count': 42
        },
        'sections': []
    }
    assert_identical_output(input_data, optimized_cls=OptimizedReportGenerator)
    print("set_footer refactoring match confirmed.")

def test_full_report_integration():
    print("Testing full report integration...")
    input_data = {
        'header': {
            'title': 'Full Integration', 
            'date': datetime(2024, 1, 1, 0, 0, 0)
        },
        'footer': {
            'author': 'Test Suite',
            'page_count': 123
        },
        'sections': [
            {'type': 'text', 'content': 'Content between header and footer.'}
        ]
    }
    assert_identical_output(input_data, optimized_cls=OptimizedReportGenerator)
    print("Full report integration match confirmed.")

if __name__ == "__main__":
    try:
        test_header_refactoring()
        test_footer_refactoring()
        test_full_report_integration()
        print("All header/footer refactoring tests passed!")
    except AssertionError as e:
        print(f"Refactoring check failed: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"An error occurred: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
