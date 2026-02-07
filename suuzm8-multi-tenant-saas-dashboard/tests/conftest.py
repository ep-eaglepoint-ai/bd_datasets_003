import io
import os
from pathlib import Path

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def user(db):
    User = get_user_model()
    return User.objects.create_user(username="u1", email="u1@example.com", password="pass")


@pytest.fixture
def user2(db):
    User = get_user_model()
    return User.objects.create_user(username="u2", email="u2@example.com", password="pass")


def pytest_sessionfinish(session, exitstatus):
    """Enforce the coverage requirement (>= 80%) as part of the test suite.
    """

    if os.environ.get("SKIP_COVERAGE_ASSERT") == "1":
        return

    data_file = Path.cwd() / ".coverage"
    if not data_file.exists():
        # Coverage collection wasn't enabled for this run.
        return

    try:
        import coverage  # type: ignore
    except Exception:
        return

    cov = coverage.Coverage(data_file=str(data_file))
    cov.load()
    total = cov.report(file=io.StringIO())
    if float(total) < 80.0:
        session.exitstatus = 1
