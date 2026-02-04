import sys
import os

# Ensure we can import from repository_after and tests directory
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from repository_after.report_generator import ReportGenerator as OptimizedReportGenerator
from tests.reference_report_generator import ReportGenerator as OriginalReportGenerator

def assert_stats_identical(text):
    ref_gen = OriginalReportGenerator()
    opt_gen = OptimizedReportGenerator()
    
    ref_stats = ref_gen.analyze_text(text)
    opt_stats = opt_gen.analyze_text(text)
    
    assert ref_stats == opt_stats, f"Stats mismatch for text: {repr(text)}\nRef: {ref_stats}\nOpt: {opt_stats}"

def test_analyze_standard():
    print("Testing analyze_text standard...")
    text = "Hello World! 123"
    assert_stats_identical(text)
    print("Standard text match confirmed.")

def test_analyze_empty():
    print("Testing analyze_text empty...")
    text = ""
    assert_stats_identical(text)
    print("Empty text match confirmed.")

def test_analyze_newlines():
    print("Testing analyze_text newlines...")
    text = "\n\n\n"
    assert_stats_identical(text)
    print("Newlines text match confirmed.")

def test_analyze_mixed():
    print("Testing analyze_text mixed...")
    text = "  Word1 2Words\nLine2.  "
    assert_stats_identical(text)
    print("Mixed text match confirmed.")

def test_analyze_symbols():
    print("Testing analyze_text symbols...")
    text = "!@#$%^&*()_+"
    assert_stats_identical(text)
    print("Symbols text match confirmed.")

if __name__ == "__main__":
    try:
        test_analyze_standard()
        test_analyze_empty()
        test_analyze_newlines()
        test_analyze_mixed()
        test_analyze_symbols()
        print("All analyze_text refactoring tests passed!")
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
