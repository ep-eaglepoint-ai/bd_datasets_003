"""
Meta-tests for the PEP 8 Validator Test Case.

These tests verify that the pep8_validator module correctly identifies
PEP 8 compliant and non-compliant Python files and meets all requirements.
"""

import os
import shutil
import sys
import tempfile
import unittest

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(BASE_DIR, 'repository_after'))

from pep8_validator import Pep8ValidatorTestCase, create_pep8_test


class TestPep8ValidatorRequirements(unittest.TestCase):
    """Test that all 8 requirements are met."""

    def setUp(self):
        """Create temporary test files."""
        self.temp_dir = tempfile.mkdtemp()

    def tearDown(self):
        """Clean up temporary files."""
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def create_temp_file(self, content, filename="test_file.py"):
        """Create a temporary Python file with given content."""
        file_path = os.path.join(self.temp_dir, filename)
        with open(file_path, 'w') as f:
            f.write(content)
        return file_path

    def test_requirement_1_checks_pep8_style_rules(self):
        """Requirement 1: Test must check Python file follows PEP 8 rules."""
        non_compliant_code = 'x=1\n'
        file_path = self.create_temp_file(non_compliant_code)

        test_class = create_pep8_test(file_path)
        test = test_class()

        with self.assertRaises(AssertionError):
            test.test_pep8_compliance()

    def test_requirement_2_uses_unittest_framework(self):
        """Requirement 2: Test must be written using unittest framework."""
        self.assertTrue(issubclass(Pep8ValidatorTestCase, unittest.TestCase))
        self.assertTrue(hasattr(Pep8ValidatorTestCase, 'test_pep8_compliance'))

    def test_requirement_3_uses_pep8_module(self):
        """Requirement 3: Test must use the pep8 module for checking."""
        import inspect

        source = inspect.getsource(Pep8ValidatorTestCase.test_pep8_compliance)

        self.assertIn('pep8.StyleGuide', source)
        self.assertIn('check_files', source)

    def test_requirement_4_no_additional_dependencies(self):
        """Requirement 4: No additional dependencies may be used."""
        validator_file = os.path.join(
            BASE_DIR, 'repository_after', 'pep8_validator.py'
        )
        with open(validator_file, 'r') as f:
            module_code = f.read()

        allowed_imports = ['unittest', 'pep8', 'sys']
        lines = module_code.split('\n')
        import_lines = [
            line for line in lines
            if line.strip().startswith('import ')
            or line.strip().startswith('from ')
        ]

        for line in import_lines:
            if 'import' in line:
                parts = line.split()
                if 'from' in line:
                    module = parts[1]
                else:
                    module = parts[1].split('.')[0]

                self.assertIn(
                    module,
                    allowed_imports,
                    "Only unittest, pep8, and sys allowed. Found: {}".format(
                        module
                    )
                )

    def test_requirement_5_file_path_is_configurable(self):
        """Requirement 5: File path must be configurable."""
        code1 = '"""Module 1."""\n\n\nX = 1\n'
        code2 = '"""Module 2."""\n\n\nY = 2\n'
        file1 = self.create_temp_file(code1, "module1.py")
        file2 = self.create_temp_file(code2, "module2.py")

        test_class1 = create_pep8_test(file1)
        test_class2 = create_pep8_test(file2)

        self.assertEqual(test_class1.file_path, file1)
        self.assertEqual(test_class2.file_path, file2)
        self.assertNotEqual(test_class1.file_path, test_class2.file_path)

        compliant_code = '"""Test."""\n\n\ndef test():\n    """Test."""\n    pass\n'
        file3 = self.create_temp_file(compliant_code, "module3.py")

        class TestPep8(Pep8ValidatorTestCase):
            """Test class."""
            pass

        TestPep8.set_file_path(file3)
        self.assertEqual(TestPep8.file_path, file3)

    def test_requirement_6_asserts_zero_errors(self):
        """Requirement 6: Test must assert total number of errors is zero."""
        import inspect

        source = inspect.getsource(Pep8ValidatorTestCase.test_pep8_compliance)

        # Check that it uses assertEqual and compares to 0
        self.assertIn('assertEqual', source)
        self.assertIn('error_count', source)
        self.assertIn('0', source)

        # Verify it handles both pep8 and pycodestyle APIs
        self.assertIn('get_count', source)
        self.assertIn('total_errors', source)

        # Verify it actually works with a compliant file
        compliant_code = '"""Compliant."""\n\n\ndef hello():\n    """Hello."""\n    print("Hello")\n'
        file_path = self.create_temp_file(compliant_code)

        test_class = create_pep8_test(file_path)
        test = test_class()
        test.test_pep8_compliance()

    def test_requirement_7_fails_if_violations_found(self):
        """Requirement 7: Test must fail if any PEP 8 violations found."""
        non_compliant_code = 'import os,sys\ndef bad( x,y ):\n    a=1+2\n    return x+y\n'
        file_path = self.create_temp_file(non_compliant_code)

        test_class = create_pep8_test(file_path)
        test = test_class()

        with self.assertRaises(AssertionError):
            test.test_pep8_compliance()

    def test_requirement_8_clear_failure_message(self):
        """Requirement 8: Failure message must clearly indicate errors."""
        non_compliant_code = 'x=1\ny=2\n'
        file_path = self.create_temp_file(non_compliant_code, "errors.py")

        test_class = create_pep8_test(file_path)
        test = test_class()

        with self.assertRaises(AssertionError) as context:
            test.test_pep8_compliance()

        error_msg = str(context.exception)

        self.assertIn("PEP 8 style violations found", error_msg)
        self.assertIn("error(s) detected", error_msg)
        self.assertIn(file_path, error_msg)


class TestPep8ValidatorFunctionality(unittest.TestCase):
    """Additional functional tests for the validator."""

    def setUp(self):
        """Create temporary test files."""
        self.temp_dir = tempfile.mkdtemp()

    def tearDown(self):
        """Clean up temporary files."""
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def create_temp_file(self, content, filename="test_file.py"):
        """Create a temporary Python file with given content."""
        file_path = os.path.join(self.temp_dir, filename)
        with open(file_path, 'w') as f:
            f.write(content)
        return file_path

    def test_compliant_file_passes(self):
        """Test that a PEP 8 compliant file passes validation."""
        compliant_code = '"""A compliant module."""\n\n\ndef hello():\n    """Print hello."""\n    print("Hello")\n'
        file_path = self.create_temp_file(compliant_code)
        test_class = create_pep8_test(file_path)
        test = test_class()
        test.test_pep8_compliance()

    def test_non_compliant_file_fails(self):
        """Test that a PEP 8 non-compliant file fails validation."""
        non_compliant_code = 'import os,sys\ndef bad( x,y ):\n    a=1\n'
        file_path = self.create_temp_file(non_compliant_code)
        test_class = create_pep8_test(file_path)
        test = test_class()

        with self.assertRaises(AssertionError) as context:
            test.test_pep8_compliance()
        self.assertIn("PEP 8 style violations found", str(context.exception))

    def test_validator_module_follows_pep8(self):
        """Test that the validator module itself follows PEP 8."""
        validator_path = os.path.join(
            BASE_DIR, 'repository_after', 'pep8_validator.py'
        )
        test_class = create_pep8_test(validator_path)
        test = test_class()
        test.test_pep8_compliance()

    def test_file_path_must_be_configured(self):
        """Test that file path must be configured before running."""
        test_class = create_pep8_test(None)
        test = test_class()

        with self.assertRaises(AssertionError) as context:
            test.test_pep8_compliance()
        self.assertIn("File path must be configured", str(context.exception))

    def test_api_compatibility_handling(self):
        """Test that the validator handles both pep8 and pycodestyle APIs."""
        # This test verifies that error counting works correctly
        # regardless of which API is available
        compliant_code = '"""Test."""\n\n\nX = 1\n'
        file_path = self.create_temp_file(compliant_code)

        test_class = create_pep8_test(file_path)
        test = test_class()

        # Should not raise any errors for compliant code
        test.test_pep8_compliance()

        # Test with non-compliant code
        non_compliant_code = 'x=1\n'
        file_path2 = self.create_temp_file(non_compliant_code, "bad.py")

        test_class2 = create_pep8_test(file_path2)
        test2 = test_class2()

        # Should raise AssertionError, not AttributeError
        with self.assertRaises(AssertionError) as context:
            test2.test_pep8_compliance()

        # Verify it's not an AttributeError
        self.assertIsInstance(context.exception, AssertionError)
        self.assertNotIsInstance(context.exception, AttributeError)


def load_tests(loader, tests, pattern):
    """
    Custom test loader to exclude the base Pep8ValidatorTestCase.

    This prevents unittest from discovering and running the base class.
    """
    suite = unittest.TestSuite()

    # Add only our test classes
    suite.addTests(loader.loadTestsFromTestCase(TestPep8ValidatorRequirements))
    suite.addTests(loader.loadTestsFromTestCase(TestPep8ValidatorFunctionality))

    return suite


if __name__ == '__main__':
    unittest.main()