"""
PEP 8 Style Validator Test Module.

This module provides a unittest test case that verifies whether a given
Python source file conforms to PEP 8 style guidelines.
"""

import unittest

import pep8


class Pep8ValidatorTestCase(unittest.TestCase):
    """Test case for validating PEP 8 compliance of Python source files."""

    file_path = None

    @classmethod
    def set_file_path(cls, path):
        """
        Set the file path to be checked for PEP 8 compliance.

        Args:
            path: Path to the Python source file to validate.
        """
        cls.file_path = path

    def test_pep8_compliance(self):
        """
        Test that the target file has zero PEP 8 violations.

        Raises:
            AssertionError: If any PEP 8 violations are found.
        """
        self.assertIsNotNone(
            self.file_path,
            "File path must be configured before running the test. "
            "Use set_file_path() or set the file_path class attribute."
        )

        style_guide = pep8.StyleGuide(quiet=False)
        result = style_guide.check_files([self.file_path])

        # Handle both pep8 and pycodestyle APIs
        # pep8 uses get_count() method
        # pycodestyle uses total_errors attribute
        if hasattr(result, 'get_count'):
            error_count = result.get_count()
        elif hasattr(result, 'total_errors'):
            error_count = result.total_errors
        else:
            self.fail(
                "Unable to determine error count from PEP 8 checker. "
                "The pep8/pycodestyle module API may have changed."
            )

        self.assertEqual(
            error_count,
            0,
            "PEP 8 style violations found: {} error(s) detected in '{}'. "
            "Please review the output above for specific violations.".format(
                error_count, self.file_path
            )
        )


def create_pep8_test(file_path):
    """
    Factory function to create a PEP 8 validator test case for a file.

    Args:
        file_path: Path to the Python source file to validate.

    Returns:
        A configured Pep8ValidatorTestCase class.
    """
    class ConfiguredPep8Test(Pep8ValidatorTestCase):
        """Configured PEP 8 test case."""

        pass

    ConfiguredPep8Test.file_path = file_path
    return ConfiguredPep8Test


if __name__ == '__main__':
    import sys

    if len(sys.argv) > 1:
        target_file = sys.argv[1]
        sys.argv = sys.argv[:1]

        Pep8ValidatorTestCase.set_file_path(target_file)
        unittest.main()
    else:
        print("Usage: python pep8_validator.py <path_to_python_file>")
        sys.exit(1)
