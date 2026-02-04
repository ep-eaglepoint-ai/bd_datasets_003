import sys
import os
import random
import string
from collections import OrderedDict

# Ensure we can import from repository_after and tests directory
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from repository_after.report_generator import ReportGenerator as OptimizedReportGenerator
from tests.reference_report_generator import ReportGenerator as OriginalReportGenerator

def assert_sanitize_identical(text, replacements):
    ref_gen = OriginalReportGenerator()
    opt_gen = OptimizedReportGenerator()
    
    ref_result = ref_gen.sanitize_text(text, replacements)
    opt_result = opt_gen.sanitize_text(text, replacements)
    
    # Use ascii() to show hidden characters if mismatch
    assert ref_result == opt_result, (
        f"Mismatch!\nInput: {repr(text)}\nReplacements: {replacements}\n"
        f"Ref: {repr(ref_result)}\nOpt: {repr(opt_result)}"
    )

def test_sanitize_simple():
    print("Testing sanitize_text simple...")
    text = "Hello World"
    replacements = {'World': 'Universe'}
    assert_sanitize_identical(text, replacements)
    print("Simple match confirmed.")

def test_sanitize_chain():
    print("Testing sanitize_text chain...")
    text = "a"
    # OrderedDict to guarantee order, though modern Python dicts preserve insertion order.
    # Ref implementation iterates dict items, so order matters.
    # a -> b, b -> c => result should be "c"
    replacements = OrderedDict([('a', 'b'), ('b', 'c')])
    assert_sanitize_identical(text, replacements)
    print("Chain match confirmed.")

def test_sanitize_overlap():
    print("Testing sanitize_text overlap...")
    text = "aaa"
    # "aa" -> "b"
    # Ref logic: finds first "aa" at index 0, replaces with "b", index moves to 2.
    # Remaining string is "a" (from index 2).
    # "aaa" -> "ba"
    # str.replace("aa", "b") does "aaa".replace("aa", "b") -> "ba" (greedy left-to-right)
    replacements = {'aa': 'b'}
    assert_sanitize_identical(text, replacements)
    print("Overlap match confirmed.")

def test_sanitize_fuzz():
    print("Testing sanitize_text fuzz...")
    random.seed(42)
    chars = string.ascii_lowercase + " "
    for _ in range(100):
        # Generate random text
        text = "".join(random.choice(chars) for _ in range(20))
        # Generate random replacements (small subset to collision likely)
        replacements = {}
        for _ in range(3):
            old = "".join(random.choice(chars) for _ in range(2))
            new = "".join(random.choice(chars) for _ in range(2))
            if old: # avoid empty string replacement
                replacements[old] = new
        
        assert_sanitize_identical(text, replacements)
    print("Fuzz match confirmed.")

if __name__ == "__main__":
    try:
        test_sanitize_simple()
        test_sanitize_chain()
        test_sanitize_overlap()
        test_sanitize_fuzz()
        print("All sanitize_text refactoring tests passed!")
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
