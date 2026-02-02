import unittest
import sys
import os
import time
from collections import defaultdict

# Add project root to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

def run_evaluation():
    loader = unittest.TestLoader()
    tests_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'tests'))
    
    # Discover all test files
    suite = unittest.TestSuite()
    
    # Load after_test.py
    after_suite = loader.loadTestsFromName('after_test', 
                                          module=None if tests_dir not in sys.path else None)
    # Actually, let's use discover properly
    before_suite = loader.discover(start_dir=tests_dir, pattern='before_test.py')
    after_suite = loader.discover(start_dir=tests_dir, pattern='after_test.py')
    unit_suite = loader.discover(start_dir=tests_dir, pattern='test_data_processor.py')
    
    # Combine suites
    full_suite = unittest.TestSuite([before_suite, after_suite, unit_suite])
    
    print("="*70)
    print("EVALUATION: Data Filtering & Aggregation Performance Optimization")
    print("="*70)
    print()
    
    # Run tests with detailed output
    start_time = time.time()
    runner = unittest.TextTestRunner(verbosity=2, stream=sys.stdout)
    result = runner.run(full_suite)
    end_time = time.time()
    
    total_time = end_time - start_time
    
    # Categorize results
    before_tests = defaultdict(list)
    after_tests = defaultdict(list)
    unit_tests = defaultdict(list)
    
    for test, traceback in result.failures:
        test_name = str(test)
        if 'before_test' in test_name:
            before_tests['failures'].append(test_name)
        elif 'after_test' in test_name:
            after_tests['failures'].append(test_name)
        elif 'test_data_processor' in test_name:
            unit_tests['failures'].append(test_name)
    
    for test, traceback in result.errors:
        test_name = str(test)
        if 'before_test' in test_name:
            before_tests['errors'].append(test_name)
        elif 'after_test' in test_name:
            after_tests['errors'].append(test_name)
        elif 'test_data_processor' in test_name:
            unit_tests['errors'].append(test_name)
    
    # Count all tests by category from the suite
    def count_tests_in_suite(suite):
        count = 0
        if hasattr(suite, '__iter__'):
            for item in suite:
                if hasattr(item, '__iter__'):
                    count += count_tests_in_suite(item)
                else:
                    count += 1
        return count
    
    total_before = count_tests_in_suite(before_suite)
    total_after = count_tests_in_suite(after_suite)
    total_unit = count_tests_in_suite(unit_suite)
    
    before_success = total_before - len(before_tests['failures']) - len(before_tests['errors'])
    after_success = total_after - len(after_tests['failures']) - len(after_tests['errors'])
    unit_success = total_unit - len(unit_tests['failures']) - len(unit_tests['errors'])
    
    print()
    print("="*70)
    print("METRICS SUMMARY")
    print("-"*70)
    print()
    
    print("BEFORE TESTS (before_test.py) - Exposes issues in original code:")
    print(f"  Total: {total_before}")
    print(f"  Passed: {before_success}")
    print(f"  Failed: {len(before_tests['failures'])} (expected - shows performance issues)")
    print(f"  Errors: {len(before_tests['errors'])}")
    if before_tests['failures']:
        print("  Note: Failures are expected - these tests expose performance issues")
        for f in before_tests['failures'][:3]:  # Show first 3
            print(f"    - {f}")
    print()
    
    print("FUNCTIONAL TESTS (after_test.py):")
    print(f"  Total: {total_after}")
    print(f"  Passed: {after_success}")
    print(f"  Failed: {len(after_tests['failures'])}")
    print(f"  Errors: {len(after_tests['errors'])}")
    if after_tests['failures']:
        print("  Failures:")
        for f in after_tests['failures'][:5]:  # Show first 5
            print(f"    - {f}")
    if after_tests['errors']:
        print("  Errors:")
        for e in after_tests['errors'][:5]:
            print(f"    - {e}")
    print()
    
    print("UNIT & INTEGRATION TESTS (test_data_processor.py):")
    print(f"  Total: {total_unit}")
    print(f"  Passed: {unit_success}")
    print(f"  Failed: {len(unit_tests['failures'])}")
    print(f"  Errors: {len(unit_tests['errors'])}")
    if unit_tests['failures']:
        print("  Failures:")
        for f in unit_tests['failures'][:5]:
            print(f"    - {f}")
    if unit_tests['errors']:
        print("  Errors:")
        for e in unit_tests['errors'][:5]:
            print(f"    - {e}")
    print()
    
    print("OVERALL:")
    print(f"  Total Tests Run: {result.testsRun}")
    print(f"  Total Passed: {result.testsRun - len(result.failures) - len(result.errors)}")
    print(f"  Total Failed: {len(result.failures)}")
    print(f"  Total Errors: {len(result.errors)}")
    print(f"  Total Execution Time: {total_time:.4f} seconds")
    print()
    print("="*70)
    
    # Determine overall status
    # Note: before_test.py failures are expected when testing original code
    # They should pass when testing optimized code
    critical_failures = len(after_tests['failures']) + len(after_tests['errors']) + \
                        len(unit_tests['failures']) + len(unit_tests['errors'])
    
    if critical_failures == 0:
        print("\n✅ OVERALL STATUS: PASS")
        print("   All critical tests passed. Optimized implementation is correct and efficient.")
        if len(before_tests['failures']) > 0 or len(before_tests['errors']) > 0:
            print(f"   Note: {len(before_tests['failures']) + len(before_tests['errors'])} before_test failures")
            print("         are expected when testing original code (shows performance issues).")
        sys.exit(0)
    else:
        print("\n❌ OVERALL STATUS: FAIL")
        print("   Some critical tests failed. Review failures above.")
        if len(before_tests['failures']) > 0 or len(before_tests['errors']) > 0:
            print(f"   Note: {len(before_tests['failures']) + len(before_tests['errors'])} before_test failures")
            print("         are expected when testing original code (shows performance issues).")
        sys.exit(1)

if __name__ == '__main__':
    run_evaluation()
