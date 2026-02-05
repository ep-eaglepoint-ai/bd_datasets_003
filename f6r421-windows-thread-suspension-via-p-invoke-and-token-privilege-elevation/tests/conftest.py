
import os

import pytest


def get_repo_path():
    """Return path to repository_after (project root / repository_after). Tests run only against repository_after."""
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    return os.path.join(root, "repository_after")


@pytest.fixture(scope="session")
def repo_path():
    return get_repo_path()



@pytest.fixture(scope="session")
def repo_sources(repo_path):
    """Collect all Python source under repo for static checks."""
    sources = {}
    if not os.path.isdir(repo_path):
        return sources
    for root, _dirs, files in os.walk(repo_path):
        for f in files:
            if f.endswith(".py"):
                path = os.path.join(root, f)
                rel = os.path.relpath(path, repo_path)
                with open(path, "r", encoding="utf-8", errors="replace") as fp:
                    sources[rel] = fp.read()
    return sources


@pytest.fixture(scope="session")
def combined_source(repo_sources):
    """Single string of all repo source for grep-style checks."""
    return "\n".join(repo_sources.values())
