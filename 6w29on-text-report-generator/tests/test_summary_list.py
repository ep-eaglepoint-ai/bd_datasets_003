import sys
import os
from collections import OrderedDict

# Ensure we can import from repository_after and tests directory
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from repository_after.report_generator import ReportGenerator as OptimizedReportGenerator
from tests.test_baseline import assert_identical_output

def test_summary_mixed_types():
    print("Testing summary mixed types...")
    # Use OrderedDict to ensure consistent iteration order for verification,
    # although standard dicts are ordered in recent Python versions.
    data = OrderedDict([
        ('String', 'Text value'),
        ('Integer', 42),
        ('Float', 3.14),
        ('Boolean', True)
    ])
    input_data = {
        'sections': [
            {
                'type': 'summary',
                'data': data
            }
        ]
    }
    assert_identical_output(input_data, optimized_cls=OptimizedReportGenerator)
    print("Summary mixed types match confirmed.")

def test_list_numbered():
    print("Testing numbered list...")
    input_data = {
        'sections': [
            {
                'type': 'list',
                'title': 'Priority Items',
                'items': ['First', 'Second', 'Third'],
                'numbered': True
            }
        ]
    }
    assert_identical_output(input_data, optimized_cls=OptimizedReportGenerator)
    print("Numbered list match confirmed.")

def test_list_bulleted():
    print("Testing bulleted list...")
    input_data = {
        'sections': [
            {
                'type': 'list',
                'title': 'Shopping List',
                'items': ['Apples', 'Bananas', 'Oranges'],
                'numbered': False
            }
        ]
    }
    assert_identical_output(input_data, optimized_cls=OptimizedReportGenerator)
    print("Bulleted list match confirmed.")

def test_empty_structures():
    print("Testing empty structures...")
    input_data = {
        'sections': [
            {
                'type': 'summary', 
                'data': {}
            },
            {
                'type': 'list',
                'title': 'Empty List',
                'items': [],
                'numbered': True
            }
        ]
    }
    assert_identical_output(input_data, optimized_cls=OptimizedReportGenerator)
    print("Empty structures match confirmed.")

if __name__ == "__main__":
    try:
        test_summary_mixed_types()
        test_list_numbered()
        test_list_bulleted()
        test_empty_structures()
        print("All summary/list refactoring tests passed!")
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
