import pytest
import os

@pytest.fixture(autouse=True)
def enable_db_access_for_all_tests(db):
    pass

def pytest_collection_modifyitems(config, items):
    if os.environ.get('EXPECT_FAILURES') == '1':
        for item in items:
            item.add_marker(pytest.mark.xfail(
                reason="Expected failure in unoptimized (repository_before)repository",
                strict=False
            ))
