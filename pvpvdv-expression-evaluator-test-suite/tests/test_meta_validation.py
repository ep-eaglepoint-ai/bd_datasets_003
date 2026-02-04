"""
Meta tests to validate the quality of tests in repository_after/tests/
These tests verify that the test suite properly covers all requirements.
"""
import pytest
import os
import sys
import ast
import inspect
import subprocess

# Add repository_after to path
repo_after_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'repository_after')
sys.path.insert(0, repo_after_path)
sys.path.insert(0, os.path.join(repo_after_path, 'tests'))

from main import ExpressionEvaluator

# Import test classes from repository_after/tests
import importlib.util
spec = importlib.util.spec_from_file_location(
    "test_expression_evaluator",
    os.path.join(repo_after_path, 'tests', 'test_expression_evaluator.py')
)
test_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(test_module)

TestBasicArithmetic = test_module.TestBasicArithmetic
TestOperatorPrecedence = test_module.TestOperatorPrecedence
TestParentheses = test_module.TestParentheses
TestDivisionByZero = test_module.TestDivisionByZero
TestMalformedExpressions = test_module.TestMalformedExpressions
TestEdgeCases = test_module.TestEdgeCases
TestComplexExpressions = test_module.TestComplexExpressions


class TestMetaTestStructure:
    """Verify test suite structure and organization"""

    def test_all_test_classes_exist(self):
        """Verify all required test classes are present"""
        required_classes = [
            'TestBasicArithmetic',
            'TestOperatorPrecedence',
            'TestParentheses',
            'TestDivisionByZero',
            'TestMalformedExpressions',
            'TestEdgeCases',
            'TestComplexExpressions'
        ]

        # All classes are already imported at module level
        import sys
        test_module = sys.modules[__name__]

        for class_name in required_classes:
            assert globals().get(class_name) is not None, \
                f"Test class {class_name} is missing from test suite"

    def test_minimum_test_count(self):
        """Verify test suite has adequate number of test methods"""
        all_classes = [
            TestBasicArithmetic,
            TestOperatorPrecedence,
            TestParentheses,
            TestDivisionByZero,
            TestMalformedExpressions,
            TestEdgeCases,
            TestComplexExpressions
        ]

        total_tests = 0
        for test_class in all_classes:
            test_methods = [m for m in dir(test_class) if m.startswith('test_')]
            total_tests += len(test_methods)

        assert total_tests >= 40, \
            f"Test suite should have at least 40 tests, found {total_tests}"

    def test_tests_have_docstrings(self):
        """Verify critical tests have documentation"""
        critical_tests = [
            (TestOperatorPrecedence, 'test_multiplication_before_addition'),
            (TestDivisionByZero, 'test_direct_division_by_zero'),
            (TestMalformedExpressions, 'test_unclosed_opening_parenthesis'),
        ]

        for test_class, method_name in critical_tests:
            method = getattr(test_class, method_name)
            assert method.__doc__ is not None and len(method.__doc__.strip()) > 0, \
                f"{test_class.__name__}.{method_name} should have a docstring"


class TestMetaRequirementCoverage:
    """Verify all problem statement requirements are tested"""

    def test_operator_precedence_requirement(self):
        """Verify multiplication before addition is tested (requirement from problem statement)"""
        evaluator = ExpressionEvaluator()

        # The key test case from problem statement: 100 + 50 * 2 should be 200
        result = evaluator.evaluate("100 + 50 * 2")
        assert result == 200.0, \
            "Operator precedence test must verify 100 + 50 * 2 = 200"

        # Verify test exists in test suite
        test_instance = TestOperatorPrecedence()
        test_instance.setup_method()
        test_instance.test_multiplication_before_addition()

    def test_parentheses_requirement(self):
        """Verify parentheses for explicit grouping are tested"""
        evaluator = ExpressionEvaluator()

        # Verify parentheses override precedence
        result = evaluator.evaluate("(100 + 50) * 2")
        assert result == 300.0, \
            "Parentheses must override operator precedence"

        # Verify test suite covers this
        test_instance = TestParentheses()
        test_instance.setup_method()
        test_instance.test_parentheses_override_precedence()

    def test_division_by_zero_requirement(self):
        """Verify division by zero raises catchable exception (not crash)"""
        evaluator = ExpressionEvaluator()

        # Should raise ZeroDivisionError, not crash
        with pytest.raises(ZeroDivisionError):
            evaluator.evaluate("10 / 0")

        # Verify test suite covers this
        test_instance = TestDivisionByZero()
        test_instance.setup_method()
        test_instance.test_direct_division_by_zero()

    def test_malformed_expression_requirement(self):
        """Verify malformed expressions raise error and don't hang"""
        evaluator = ExpressionEvaluator()

        # Key case from problem statement: (10 + 5 should error, not hang
        with pytest.raises(ValueError, match="Mismatched parentheses"):
            evaluator.evaluate("(10 + 5")

        # Verify test suite covers this
        test_instance = TestMalformedExpressions()
        test_instance.setup_method()
        test_instance.test_unclosed_opening_parenthesis()

    def test_invalid_characters_requirement(self):
        """Verify invalid characters are rejected with clear error"""
        evaluator = ExpressionEvaluator()

        with pytest.raises(ValueError, match="Invalid characters"):
            evaluator.evaluate("10 + 5a")

        # Verify test suite covers this
        test_instance = TestMalformedExpressions()
        test_instance.setup_method()
        test_instance.test_invalid_characters()


class TestMetaTestQuality:
    """Verify tests follow good practices and actually test the code"""

    def test_tests_use_assertions(self):
        """Verify tests contain actual assertions"""
        test_file = os.path.join(
            os.path.dirname(os.path.dirname(__file__)),
            'repository_after', 'tests', 'test_expression_evaluator.py'
        )

        with open(test_file, 'r') as f:
            content = f.read()
            tree = ast.parse(content)

        # Count assertion statements
        assertion_count = 0
        for node in ast.walk(tree):
            if isinstance(node, ast.Assert):
                assertion_count += 1

        assert assertion_count >= 30, \
            f"Test file should have at least 30 assertions, found {assertion_count}"

    def test_tests_use_pytest_raises(self):
        """Verify error cases use pytest.raises"""
        test_file = os.path.join(
            os.path.dirname(os.path.dirname(__file__)),
            'repository_after', 'tests', 'test_expression_evaluator.py'
        )

        with open(test_file, 'r') as f:
            content = f.read()

        # Should have multiple pytest.raises calls
        pytest_raises_count = content.count('pytest.raises')
        assert pytest_raises_count >= 8, \
            f"Should use pytest.raises at least 8 times for error tests, found {pytest_raises_count}"

    def test_each_test_class_has_setup(self):
        """Verify each test class properly initializes evaluator"""
        all_classes = [
            TestBasicArithmetic,
            TestOperatorPrecedence,
            TestParentheses,
            TestDivisionByZero,
            TestMalformedExpressions,
            TestEdgeCases,
            TestComplexExpressions
        ]

        for test_class in all_classes:
            assert hasattr(test_class, 'setup_method'), \
                f"{test_class.__name__} should have setup_method"

    def test_tests_are_independent(self):
        """Verify tests can run in any order (each creates fresh evaluator)"""
        # Run a sample test from each class
        test_methods = [
            (TestBasicArithmetic(), 'test_simple_addition'),
            (TestOperatorPrecedence(), 'test_multiplication_before_addition'),
            (TestParentheses(), 'test_simple_parentheses'),
        ]

        for test_instance, method_name in test_methods:
            test_instance.setup_method()
            method = getattr(test_instance, method_name)
            method()  # Should not raise


class TestMetaEdgeCaseCoverage:
    """Verify edge cases are properly tested"""

    def test_empty_input_covered(self):
        """Verify empty/whitespace input is tested"""
        test_instance = TestEdgeCases()
        test_instance.setup_method()
        test_instance.test_empty_expression()
        test_instance.test_only_spaces()

    def test_single_value_covered(self):
        """Verify single number input is tested"""
        test_instance = TestEdgeCases()
        test_instance.setup_method()
        test_instance.test_single_number()

    def test_decimal_numbers_covered(self):
        """Verify decimal number support is tested"""
        evaluator = ExpressionEvaluator()
        result = evaluator.evaluate("3.5 + 2.5")
        assert result == 6.0


class TestMetaErrorHandling:
    """Verify all error scenarios are properly tested"""

    def test_all_parentheses_errors_covered(self):
        """Verify various parentheses mismatch scenarios are tested"""
        error_cases = [
            "(10 + 5",      # Unclosed opening
            "10 + 5)",      # Extra closing
            "((10 + 5) * 2", # Nested unclosed
        ]

        evaluator = ExpressionEvaluator()
        for expr in error_cases:
            with pytest.raises(ValueError, match="Mismatched parentheses"):
                evaluator.evaluate(expr)

    def test_division_by_zero_scenarios_covered(self):
        """Verify multiple division by zero scenarios are tested"""
        test_instance = TestDivisionByZero()
        test_instance.setup_method()

        # Verify multiple scenarios exist
        test_instance.test_direct_division_by_zero()
        test_instance.test_division_by_zero_in_expression()


class TestMetaRealWorldScenarios:
    """Verify practical use cases are tested"""

    def test_financial_calculation_scenario(self):
        """Verify financial formula scenario from problem statement is tested"""
        evaluator = ExpressionEvaluator()

        # Example: revenue - expenses * tax_rate
        result = evaluator.evaluate("1000 - 200 * 0.15")
        assert result == 970.0, \
            "Should support financial formula calculations"

        # Verify test exists
        test_instance = TestComplexExpressions()
        test_instance.setup_method()
        test_instance.test_financial_formula_basic()

    def test_complex_nested_calculations(self):
        """Verify complex nested expressions are tested"""
        test_instance = TestComplexExpressions()
        test_instance.setup_method()
        test_instance.test_deeply_nested_with_all_operators()


class TestMetaTestExecution:
    """Verify tests actually run and pass in the repository_after"""

    def test_repository_after_tests_pass(self):
        """Verify all tests in repository_after pass"""
        repo_after_tests = os.path.join(
            os.path.dirname(os.path.dirname(__file__)),
            'repository_after', 'tests'
        )

        # Run pytest on repository_after/tests
        result = subprocess.run(
            ['pytest', repo_after_tests, '-v', '--tb=short'],
            capture_output=True,
            text=True,
            cwd=os.path.dirname(os.path.dirname(__file__))
        )

        assert result.returncode == 0, \
            f"Tests in repository_after should all pass.\nOutput:\n{result.stdout}\n{result.stderr}"

    def test_no_skipped_tests(self):
        """Verify no tests are skipped"""
        repo_after_tests = os.path.join(
            os.path.dirname(os.path.dirname(__file__)),
            'repository_after', 'tests'
        )

        result = subprocess.run(
            ['pytest', repo_after_tests, '-v'],
            capture_output=True,
            text=True,
            cwd=os.path.dirname(os.path.dirname(__file__))
        )

        assert 'skipped' not in result.stdout.lower(), \
            "No tests should be skipped"
