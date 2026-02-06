import sys
import os
from datetime import datetime

# Ensure we can import from repository_after and tests directory
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from repository_after.report_generator import ReportGenerator as OptimizedReportGenerator
from tests.test_baseline import assert_identical_output

def test_build_table_standard():
    print("Testing build_table standard...")
    input_data = {
        'sections': [
            {
                'type': 'table',
                'headers': ['ID', 'Name', 'Role'],
                'rows': [
                    ['1', 'Alice', 'Engineer'],
                    ['2', 'Bob', 'Designer'],
                    ['3', 'Charlie', 'Manager']
                ],
                'col_width': 10
            }
        ]
    }
    assert_identical_output(input_data, optimized_cls=OptimizedReportGenerator)
    print("Standard table match confirmed.")

def test_build_table_truncation():
    print("Testing build_table truncation...")
    input_data = {
        'sections': [
            {
                'type': 'table',
                'headers': ['LongHeaderNameThatShouldBeTruncated', 'Short'],
                'rows': [
                    ['Valid', 'Value'],
                    ['ThisIsAlsoVeryLongAndShouldTruncate', 'Ok']
                ],
                'col_width': 10
            }
        ]
    }
    assert_identical_output(input_data, optimized_cls=OptimizedReportGenerator)
    print("Table truncation match confirmed.")

def test_build_table_padding():
    print("Testing build_table padding...")
    input_data = {
        'sections': [
            {
                'type': 'table',
                'headers': ['A', 'B'],
                'rows': [
                    ['1', '2'],
                    ['100', '200']
                ],
                'col_width': 20
            }
        ]
    }
    assert_identical_output(input_data, optimized_cls=OptimizedReportGenerator)
    print("Table padding match confirmed.")

def test_build_table_empty():
    print("Testing build_table empty rows...")
    input_data = {
        'sections': [
            {
                'type': 'table',
                'headers': ['Empty', 'Table'],
                'rows': [],
                'col_width': 10
            }
        ]
    }
    assert_identical_output(input_data, optimized_cls=OptimizedReportGenerator)
    print("Empty table match confirmed.")

if __name__ == "__main__":
    try:
        test_build_table_standard()
        test_build_table_truncation()
        test_build_table_padding()
        test_build_table_empty()
        print("All build_table refactoring tests passed!")
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
