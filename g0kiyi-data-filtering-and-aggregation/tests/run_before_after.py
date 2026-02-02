#!/usr/bin/env python3
"""
Wrapper script to run before_test and after_test.
Exits with 0 even if before_test has expected failures.
"""
import sys
import unittest

# Add project root to sys.path
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

def run_tests():
    loader = unittest.TestLoader()
    
    # Load both test modules
    before_suite = loader.loadTestsFromName('tests.before_test')
    after_suite = loader.loadTestsFromName('tests.after_test')
    
    # Combine suites
    full_suite = unittest.TestSuite([before_suite, after_suite])
    
    # Run tests
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(full_suite)
    
    # Print summary
    print("\n" + "="*70)
    print("BEFORE-AFTER TEST SUMMARY")
    print("="*70)
    print(f"Total Tests: {result.testsRun}")
    print(f"Before Test Failures: {len([f for f in result.failures if 'before_test' in str(f[0])])} (EXPECTED)")
    print(f"After Test Failures: {len([f for f in result.failures if 'after_test' in str(f[0])])}")
    print(f"Errors: {len(result.errors)}")
    print(f"Passed: {result.testsRun - len(result.failures) - len(result.errors)}")
    print("\nNote: Before test failures are EXPECTED (show performance issues).")
    print("After test failures indicate correctness problems.")
    print("="*70)
    
    # Exit with 0 if only before_test failures (expected)
    # Exit with 1 if after_test failures (unexpected)
    after_test_failures = len([f for f in result.failures if 'after_test' in str(f[0])])
    after_test_errors = len([e for e in result.errors if 'after_test' in str(e[0])])
    
    if after_test_failures > 0 or after_test_errors > 0:
        print("\n❌ FAIL: After tests failed - this indicates correctness issues!")
        sys.exit(1)
    else:
        print("\n✅ PASS: All after tests passed. Before test failures are expected.")
        sys.exit(0)

if __name__ == '__main__':
    run_tests()
