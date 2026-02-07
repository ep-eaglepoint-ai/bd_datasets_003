import os
import sys
import pytest
import importlib

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

@pytest.fixture(scope="session")
def SearchIndexClass():
    target_repo = os.environ.get("TARGET_REPO", "repository_after")
    
    if target_repo == "repository_before":
        from repository_before.search_index import SearchIndex
    elif target_repo == "repository_after":
        from repository_after.search_index import SearchIndex
    else:
        # Fallback or strict error? 
        # For safety in IDEs, default to after? 
        try:
            from repository_after.search_index import SearchIndex
        except ImportError:
            from repository_before.search_index import SearchIndex
            
    return SearchIndex
