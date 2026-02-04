import sys
import os
from datetime import datetime

# Ensure we can import from tests directory
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tests.reference_report_generator import ReportGenerator as OriginalReportGenerator

def generate_full_report(generator_cls, config):
    gen = generator_cls()
    if 'header' in config:
        gen.set_header(config['header']['title'], config['header']['date'])
    if 'footer' in config:
        gen.set_footer(config['footer']['author'], config['footer']['page_count'])
    
    return gen.build_report(config['sections'])

def assert_identical_output(input_data, optimized_cls=None):
    """
    Runs the original implementation and the optimized implementation (if provided)
    and asserts byte-for-byte equality of output strings.
    If optimized_cls is None, it runs against itself (sanity check).
    """
    ref_cls = OriginalReportGenerator
    target_cls = optimized_cls if optimized_cls else ref_cls
    
    output_ref = generate_full_report(ref_cls, input_data)
    output_target = generate_full_report(target_cls, input_data)
    
    assert output_ref == output_target, "Outputs do not match byte-for-byte"

def test_sanity_reference_matches_itself():
    # Define complex input data to exercise all parts
    input_data = {
        'header': {
            'title': 'Test Report', 
            'date': datetime(2023, 1, 1, 12, 0, 0)
        },
        'footer': {
            'author': 'Test Author',
            'page_count': 5
        },
        'sections': [
            {'type': 'text', 'content': 'This is some intro text.'},
            {
                'type': 'table', 
                'headers': ['Col1', 'Col2'], 
                'rows': [['A', 'B'], ['1', '2']],
                'col_width': 10
            },
            {
                'type': 'summary',
                'data': {'Key1': 'Value1', 'Key2': 100}
            },
            {
                'type': 'list',
                'title': 'My List',
                'items': ['Item 1', 'Item 2'],
                'numbered': True
            }
        ]
    }
    
    assert_identical_output(input_data, optimized_cls=None)

if __name__ == "__main__":
    try:
        test_sanity_reference_matches_itself()
        print("Sanity check passed!")
    except AssertionError as e:
        print(f"Sanity check failed: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"An error occurred: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
