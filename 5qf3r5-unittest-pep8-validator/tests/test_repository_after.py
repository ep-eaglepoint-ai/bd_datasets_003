"""
Tests to run directly against repository_after code.

These tests verify the functionality of the PEP 8 validator.
"""

import os
import sys
import unittest

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(BASE_DIR, 'repository_after'))

from pep8_validator import create_pep8_test


class TestRepositoryAfterCode(unittest.TestCase):
    """Test cases for repository_after code."""

    def test_sample_compliant_passes(self):
        """Test that sample_compliant.py passes PEP 8 checks."""
        file_path = os.path.join(
            BASE_DIR, 'repository_after', 'sample_compliant.py'
        )
        test_class = create_pep8_test(file_path)
        test = test_class()
        test.test_pep8_compliance()

    def test_sample_non_compliant_fails(self):
        """Test that sample_non_compliant.py fails PEP 8 checks."""
        file_path = os.path.join(
            BASE_DIR, 'repository_after', 'sample_non_compliant.py'
        )
        test_class = create_pep8_test(file_path)
        test = test_class()

        with self.assertRaises(AssertionError):
            test.test_pep8_compliance()

    def test_pep8_validator_passes(self):
        """Test that pep8_validator.py itself passes PEP 8 checks."""
        file_path = os.path.join(
            BASE_DIR, 'repository_after', 'pep8_validator.py'
        )
        test_class = create_pep8_test(file_path)
        test = test_class()
        test.test_pep8_compliance()


if __name__ == '__main__':
    unittest.main()