import pytest


def pytest_addoption(parser):
    """Add custom command line option for specifying repository."""
    parser.addoption(
        "--repo",
        action="store",
        default="after",
        help="Specify which repository to test: 'before' or 'after'"
    )


@pytest.fixture
def repo(request):
    """Fixture to get the repository from command line."""
    return request.config.getoption("--repo")

