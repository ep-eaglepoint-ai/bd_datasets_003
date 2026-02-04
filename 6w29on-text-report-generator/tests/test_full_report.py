import sys
import os
from datetime import datetime

# Ensure we can import from repository_after and tests directory
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from repository_after.report_generator import ReportGenerator as OptimizedReportGenerator
from tests.test_baseline import assert_identical_output

def test_full_report_complex():
    print("Testing full complex report...")
    input_data = {
        'header': {
            'title': 'Complex Report', 
            'date': datetime(2025, 5, 20, 14, 0, 0)
        },
        'footer': {
            'author': 'QA Architect',
            'page_count': 99
        },
        'sections': [
            {'type': 'text', 'content': 'Executive Summary'},
            {
                'type': 'table',
                'headers': ['Metric', 'Value'],
                'rows': [['CPU', '90%'], ['RAM', '60%']],
                'col_width': 12
            },
            {
                'type': 'text', 'content': 'Detailed Analysis'},
            {
                'type': 'summary',
                'data': {'Tests Passed': 100, 'Tests Failed': 0}
            },
            {
                'type': 'list',
                'title': 'Recommendations',
                'items': ['Optimize code', 'Refactor legacy'],
                'numbered': True
            }
        ]
    }
    assert_identical_output(input_data, optimized_cls=OptimizedReportGenerator)
    print("Complex report match confirmed.")

def test_report_no_sections():
    print("Testing report with no sections...")
    input_data = {
        'header': {
            'title': 'Empty Report', 
            'date': datetime(2025, 1, 1, 0, 0, 0)
        },
        'footer': {
            'author': 'Nobody',
            'page_count': 0
        },
        'sections': []
    }
    assert_identical_output(input_data, optimized_cls=OptimizedReportGenerator)
    print("No sections match confirmed.")

def test_report_repeated_sections():
    print("Testing report with repeated sections...")
    input_data = {
        'header': {
            'title': 'Repeated', 
            'date': datetime(2025, 1, 1, 0, 0, 0)
        },
        'footer': {
            'author': 'Repeater',
            'page_count': 1
        },
        'sections': [
            {'type': 'text', 'content': 'Text 1'},
            {'type': 'text', 'content': 'Text 2'},
            {'type': 'text', 'content': 'Text 3'}
        ]
    }
    assert_identical_output(input_data, optimized_cls=OptimizedReportGenerator)
    print("Repeated sections match confirmed.")

if __name__ == "__main__":
    try:
        test_full_report_complex()
        test_report_no_sections()
        test_report_repeated_sections()
        print("All build_report refactoring tests passed!")
    except AssertionError as e:
        print(f"Refactoring check failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    except Exception as e:
        print(f"An error occurred: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
