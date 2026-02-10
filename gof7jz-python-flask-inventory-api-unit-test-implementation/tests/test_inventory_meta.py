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
    test_file_options = [
        repo_path / "tests" / "test_inventory.py",
        repo_path / "test_inventory.py"
    ]
    
    test_file = None
    for option in test_file_options:
        if option.exists():
            test_file = option
            break
            
    if test_file is None:
        return None, "Test file not found"

    cmd = [sys.executable, "-m", "pytest", str(test_file), "-v"]
    if extra_args:
        cmd.extend(extra_args)
        
    env = os.environ.copy()
    env["PYTHONPATH"] = str(repo_path)
    
    result = subprocess.run(cmd, capture_output=True, text=True, env=env, cwd=str(project_root))
    return result.stdout, result.stderr

def get_outcomes():
    repo_dir = os.environ.get('TEST_REPO_DIR', 'repository_after')
    if repo_dir not in _TEST_RESULTS_CACHE:
        # Pass --random-order to verify isolation
        stdout, stderr = run_repo_tests(repo_dir, extra_args=["--cov=app", "--cov-report=term-missing", "--random-order"])
        
        # If test file doesn't exist, fail immediately
        if stdout is None and stderr == "Test file not found":
            pytest.fail(f"Test file not found in {repo_dir}/test_inventory.py - cannot run meta-tests")
        
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
    assert test_name in outcomes, f"Test '{test_name}' not found in suite!\nOutput:\n{data['stdout']}"
    assert outcomes[test_name] in ("PASSED", "PASSED "), f"Test '{test_name}' failed! Status: {outcomes[test_name]}\nOutput:\n{data['stdout']}"

# Meta Tests - Auth
def test_meta_auth_register_success(): assert_test_passed("test_auth_register_success")
def test_meta_auth_register_missing_fields(): assert_test_passed("test_auth_register_missing_fields")
def test_meta_auth_register_duplicate_username(): assert_test_passed("test_auth_register_duplicate_username")
def test_meta_auth_login_success(): assert_test_passed("test_auth_login_success")
def test_meta_auth_login_invalid_password(): assert_test_passed("test_auth_login_invalid_password")
def test_meta_auth_login_missing_fields(): assert_test_passed("test_auth_login_missing_fields")
def test_meta_auth_login_disabled_user(): assert_test_passed("test_auth_login_disabled_user")
def test_meta_auth_refresh_token(): assert_test_passed("test_auth_refresh_token")
def test_meta_auth_me_endpoint(): assert_test_passed("test_auth_me_endpoint")
def test_meta_auth_token_expired(): assert_test_passed("test_auth_token_expired")
def test_meta_auth_token_invalid(): assert_test_passed("test_auth_token_invalid")
def test_meta_auth_register_null_values(): assert_test_passed("test_auth_register_null_values")

# Meta Tests - Inventory
def test_meta_inv_create_item_success(): assert_test_passed("test_inv_create_item_success")
def test_meta_inv_create_item_missing_fields(): assert_test_passed("test_inv_create_item_missing_fields")
def test_meta_inv_create_item_duplicate_sku(): assert_test_passed("test_inv_create_item_duplicate_sku")
def test_meta_inv_create_item_null_values(): assert_test_passed("test_inv_create_item_null_values")
def test_meta_inv_list_items(): assert_test_passed("test_inv_list_items")
def test_meta_inv_get_item_success(): assert_test_passed("test_inv_get_item_success")
def test_meta_inv_get_item_not_found(): assert_test_passed("test_inv_get_item_not_found")
def test_meta_inv_update_item(): assert_test_passed("test_inv_update_item")
def test_meta_inv_update_item_not_found(): assert_test_passed("test_inv_update_item_not_found")
def test_meta_inv_delete_item_success(): assert_test_passed("test_inv_delete_item_success")
def test_meta_inv_delete_item_not_found(): assert_test_passed("test_inv_delete_item_not_found")
def test_meta_inv_delete_item_with_reserved_stock(): assert_test_passed("test_inv_delete_item_with_reserved_stock")
def test_meta_inv_adjust_stock_in(): assert_test_passed("test_inv_adjust_stock_in")
def test_meta_inv_adjust_stock_not_found(): assert_test_passed("test_inv_adjust_stock_not_found")
def test_meta_inv_adjust_stock_out_insufficient(): assert_test_passed("test_inv_adjust_stock_out_insufficient")
def test_meta_inv_reserve_stock_success(): assert_test_passed("test_inv_reserve_stock_success")
def test_meta_inv_reserve_stock_not_found(): assert_test_passed("test_inv_reserve_stock_not_found")
def test_meta_inv_release_stock_success(): assert_test_passed("test_inv_release_stock_success")

# Meta Tests - Alerts
def test_meta_alerts_list(): assert_test_passed("test_alerts_list")
def test_meta_alerts_resolve(): assert_test_passed("test_alerts_resolve")
def test_meta_alerts_check_manual(): assert_test_passed("test_alerts_check_manual")

# Meta Tests - Service & Edge Cases
def test_meta_service_stock_calculations(): assert_test_passed("test_service_stock_calculations")
def test_meta_service_alert_generation(): assert_test_passed("test_service_alert_generation")
def test_meta_service_no_duplicate_alerts(): assert_test_passed("test_service_no_duplicate_alerts")
def test_meta_mock_external_notification_placeholder(): assert_test_passed("test_mock_external_notification_placeholder")
def test_meta_edge_case_negative_quantity_adjustment(): assert_test_passed("test_edge_case_negative_quantity_adjustment")
def test_meta_edge_case_zero_quantity_reservation(): assert_test_passed("test_edge_case_zero_quantity_reservation")
def test_meta_service_complex_sequential_movements(): assert_test_passed("test_service_complex_sequential_movements")
def test_meta_service_reserve_insufficient(): assert_test_passed("test_service_reserve_insufficient")
def test_meta_service_release_more_than_reserved(): assert_test_passed("test_service_release_more_than_reserved")

def test_meta_coverage_threshold():
    data = get_outcomes()
    coverage_str = data.get("coverage", "0%")
    try:
        coverage_val = int(coverage_str.replace('%', ''))
    except ValueError:
        coverage_val = 0
    
    assert coverage_val > 80, f"Coverage {coverage_val}% is not greater than 80%. Output:\n{data['stdout']}"
