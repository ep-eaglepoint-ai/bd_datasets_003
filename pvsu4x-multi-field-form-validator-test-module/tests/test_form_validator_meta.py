import os
import sys
import subprocess
import pytest
from pathlib import Path

# Cache results to avoid re-running tests multiple times
_TEST_RESULTS_CACHE = {}


def run_repo_tests(repo_dir_name, extra_args=None):
    """Utility to run pytest on a specific repository and return results."""
    project_root = Path(__file__).parent.parent
    repo_path = project_root / repo_dir_name
    test_file = repo_path / "test_form_validator.py"
    
    if not test_file.exists():
        # Return error result if test file doesn't exist
        return None, f"Test file not found: {test_file}"
    
    cmd = [sys.executable, "-m", "pytest", str(test_file), "-v"]
    if extra_args:
        cmd.extend(extra_args)
    
    env = os.environ.copy()
    env["PYTHONPATH"] = str(repo_path)
    
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        env=env,
        cwd=str(project_root)
    )
    
    return result.stdout, result.stderr


def get_outcomes():
    repo_dir = os.environ.get('TEST_REPO_DIR', 'repository_after')
    
    if repo_dir not in _TEST_RESULTS_CACHE:
        stdout, stderr = run_repo_tests(repo_dir, extra_args=["--cov=form_validator", "--cov-report=term-missing"])
        
        # Check if test file was not found
        if stdout is None:
            _TEST_RESULTS_CACHE[repo_dir] = {
                "outcomes": {},
                "coverage": None,
                "stdout": None,
                "stderr": stderr,
                "error": stderr
            }
            return _TEST_RESULTS_CACHE[repo_dir]
        
        outcomes = {}
        if stdout:
            for line in stdout.splitlines():
                if "::" in line and (" PASSED" in line or " FAILED" in line or " ERROR" in line):
                    parts = line.split()
                    if len(parts) >= 2:
                        nodeid = parts[0]
                        status = parts[1]
                        test_name = nodeid.split("::")[-1]
                        outcomes[test_name] = status
        
        coverage = None
        if stdout:
            for line in stdout.splitlines():
                if "TOTAL" in line.upper():  # Case-insensitive
                    parts = line.split()
                    for part in parts:
                        if "%" in part:
                            coverage = part
                            break
        
        _TEST_RESULTS_CACHE[repo_dir] = {
            "outcomes": outcomes,
            "coverage": coverage,
            "stdout": stdout,
            "stderr": stderr
        }
    
    return _TEST_RESULTS_CACHE[repo_dir]


def assert_test_passed(test_name):
    data = get_outcomes()
    outcomes = data["outcomes"]
    assert test_name in outcomes, f"Test '{test_name}' not found in suite!"
    assert outcomes[test_name] in ("PASSED", "PASSED "), f"Test '{test_name}' failed! Status: {outcomes[test_name]}\nOutput:\n{data['stdout']}"


# ========================================
# Meta Tests - Valid Input Tests
# ========================================

def test_meta_valid_form_basic():
    assert_test_passed("test_valid_form_basic")


def test_meta_valid_form_with_confirm_password():
    assert_test_passed("test_valid_form_with_confirm_password")


def test_meta_valid_form_with_country_code():
    assert_test_passed("test_valid_form_with_country_code")


def test_meta_valid_form_all_fields():
    assert_test_passed("test_valid_form_all_fields")


# ========================================
# Meta Tests - Username Validation
# ========================================

def test_meta_username_valid_alphanumeric():
    assert_test_passed("test_username_valid_alphanumeric")


def test_meta_username_valid_letters_only():
    assert_test_passed("test_username_valid_letters_only")


def test_meta_username_valid_unicode():
    assert_test_passed("test_username_valid_unicode")


def test_meta_username_minimum_length():
    assert_test_passed("test_username_minimum_length")


def test_meta_username_maximum_length():
    assert_test_passed("test_username_maximum_length")


def test_meta_username_too_short():
    assert_test_passed("test_username_too_short")


def test_meta_username_too_long():
    assert_test_passed("test_username_too_long")


def test_meta_username_empty_string():
    assert_test_passed("test_username_empty_string")


def test_meta_username_with_spaces():
    assert_test_passed("test_username_with_spaces")


def test_meta_username_purely_numeric():
    assert_test_passed("test_username_purely_numeric")


def test_meta_username_with_special_chars():
    assert_test_passed("test_username_with_special_chars")


def test_meta_username_only_punctuation():
    assert_test_passed("test_username_only_punctuation")


def test_meta_username_non_string():
    assert_test_passed("test_username_non_string")


# ========================================
# Meta Tests - Email Validation
# ========================================

def test_meta_email_valid_standard():
    assert_test_passed("test_email_valid_standard")


def test_meta_email_valid_subdomain():
    assert_test_passed("test_email_valid_subdomain")


def test_meta_email_valid_with_dots():
    assert_test_passed("test_email_valid_with_dots")


def test_meta_email_valid_with_plus():
    assert_test_passed("test_email_valid_with_plus")


def test_meta_email_missing_at_symbol():
    assert_test_passed("test_email_missing_at_symbol")


def test_meta_email_multiple_at_symbols():
    assert_test_passed("test_email_multiple_at_symbols")


def test_meta_email_missing_domain():
    assert_test_passed("test_email_missing_domain")


def test_meta_email_missing_local_part():
    assert_test_passed("test_email_missing_local_part")


def test_meta_email_no_dot_in_domain():
    assert_test_passed("test_email_no_dot_in_domain")


def test_meta_email_consecutive_dots():
    assert_test_passed("test_email_consecutive_dots")


def test_meta_email_domain_starts_with_dot():
    assert_test_passed("test_email_domain_starts_with_dot")


def test_meta_email_domain_ends_with_dot():
    assert_test_passed("test_email_domain_ends_with_dot")


def test_meta_email_empty_string():
    assert_test_passed("test_email_empty_string")


def test_meta_email_non_string():
    assert_test_passed("test_email_non_string")


def test_meta_email_extremely_long():
    assert_test_passed("test_email_extremely_long")


# ========================================
# Meta Tests - Password Validation
# ========================================

def test_meta_password_valid_strong():
    assert_test_passed("test_password_valid_strong")


def test_meta_password_minimum_length():
    assert_test_passed("test_password_minimum_length")


def test_meta_password_too_short():
    assert_test_passed("test_password_too_short")


def test_meta_password_no_uppercase():
    assert_test_passed("test_password_no_uppercase")


def test_meta_password_no_lowercase():
    assert_test_passed("test_password_no_lowercase")


def test_meta_password_all_lowercase():
    assert_test_passed("test_password_all_lowercase")


def test_meta_password_all_uppercase():
    assert_test_passed("test_password_all_uppercase")


def test_meta_password_no_numeric():
    assert_test_passed("test_password_no_numeric")


def test_meta_password_no_special_char():
    assert_test_passed("test_password_no_special_char")


def test_meta_password_with_space():
    assert_test_passed("test_password_with_space")


def test_meta_password_empty_string():
    assert_test_passed("test_password_empty_string")


def test_meta_password_non_string():
    assert_test_passed("test_password_non_string")


def test_meta_password_repeated_sequence_single_char():
    assert_test_passed("test_password_repeated_sequence_single_char")


def test_meta_password_repeated_sequence_double_char():
    assert_test_passed("test_password_repeated_sequence_double_char")


def test_meta_password_long_numeric_sequence():
    assert_test_passed("test_password_long_numeric_sequence")


def test_meta_password_valid_with_five_digits():
    assert_test_passed("test_password_valid_with_five_digits")


def test_meta_password_unicode_characters():
    assert_test_passed("test_password_unicode_characters")


def test_meta_password_various_special_chars():
    assert_test_passed("test_password_various_special_chars")


def test_meta_password_extremely_long():
    assert_test_passed("test_password_extremely_long")


# ========================================
# Meta Tests - Confirm Password Validation
# ========================================

def test_meta_confirm_password_matching():
    assert_test_passed("test_confirm_password_matching")


def test_meta_confirm_password_not_matching():
    assert_test_passed("test_confirm_password_not_matching")


def test_meta_confirm_password_case_sensitive():
    assert_test_passed("test_confirm_password_case_sensitive")


def test_meta_confirm_password_none():
    assert_test_passed("test_confirm_password_none")


def test_meta_confirm_password_empty_string():
    assert_test_passed("test_confirm_password_empty_string")


# ========================================
# Meta Tests - Country Code Validation
# ========================================

def test_meta_country_code_valid_us():
    assert_test_passed("test_country_code_valid_us")


def test_meta_country_code_valid_gb():
    assert_test_passed("test_country_code_valid_gb")


def test_meta_country_code_valid_lowercase():
    assert_test_passed("test_country_code_valid_lowercase")


def test_meta_country_code_invalid_length_short():
    assert_test_passed("test_country_code_invalid_length_short")


def test_meta_country_code_invalid_length_long():
    assert_test_passed("test_country_code_invalid_length_long")


def test_meta_country_code_with_numbers():
    assert_test_passed("test_country_code_with_numbers")


def test_meta_country_code_with_special_chars():
    assert_test_passed("test_country_code_with_special_chars")


def test_meta_country_code_none():
    assert_test_passed("test_country_code_none")


def test_meta_country_code_empty_string():
    assert_test_passed("test_country_code_empty_string")


def test_meta_country_code_non_string():
    assert_test_passed("test_country_code_non_string")


# ========================================
# Meta Tests - Edge Cases and Combined Tests
# ========================================

def test_meta_all_fields_empty():
    assert_test_passed("test_all_fields_empty")


def test_meta_all_fields_invalid():
    assert_test_passed("test_all_fields_invalid")


def test_meta_username_valid_email_invalid():
    assert_test_passed("test_username_valid_email_invalid")


def test_meta_username_email_valid_password_invalid():
    assert_test_passed("test_username_email_valid_password_invalid")


def test_meta_special_unicode_in_multiple_fields():
    assert_test_passed("test_special_unicode_in_multiple_fields")


def test_meta_boundary_username_3_chars():
    assert_test_passed("test_boundary_username_3_chars")


def test_meta_boundary_username_15_chars():
    assert_test_passed("test_boundary_username_15_chars")


def test_meta_boundary_password_8_chars():
    assert_test_passed("test_boundary_password_8_chars")


def test_meta_password_exactly_6_digits():
    assert_test_passed("test_password_exactly_6_digits")


def test_meta_password_5_digits_valid():
    assert_test_passed("test_password_5_digits_valid")


def test_meta_complex_valid_scenario():
    assert_test_passed("test_complex_valid_scenario")


def test_meta_email_with_numbers_in_local():
    assert_test_passed("test_email_with_numbers_in_local")


def test_meta_email_with_hyphen_in_domain():
    assert_test_passed("test_email_with_hyphen_in_domain")


def test_meta_password_with_multiple_special_chars():
    assert_test_passed("test_password_with_multiple_special_chars")


def test_meta_username_mixed_case_alphanumeric():
    assert_test_passed("test_username_mixed_case_alphanumeric")


# ========================================
# Meta Test - Code Coverage
# ========================================

def test_meta_code_coverage():
    data = get_outcomes()
    assert data["coverage"] is not None, f"Coverage extraction failed. Output:\n{data['stdout']}"
    # Accept coverage >= 95%
    coverage_value = float(data["coverage"].rstrip('%'))
    assert coverage_value >= 95.0, f"Coverage is {data['coverage']}, expected >= 95%"
