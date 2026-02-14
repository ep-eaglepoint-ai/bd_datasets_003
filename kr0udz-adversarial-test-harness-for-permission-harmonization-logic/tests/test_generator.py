import pytest
import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from repository_after.app import generate_updates

def test_generator_counts():
    n = 100
    updates = generate_updates(seed=123, n=n, m_docs=10, k_users=10)
    assert len(updates) == n

def test_generator_schema_validity():
    updates = generate_updates(seed=123, n=10, m_docs=2, k_users=2)
    required = {"doc_id", "user_id", "update_id", "permission", "source_tier", "is_refinement", "timestamp", "signature"}
    tiers = {"Bot", "Moderator", "Admin", "Owner"}
    perms = {"NONE", "VIEW", "COMMENT", "EDIT"}
    
    for u in updates:
        assert required.issubset(u.keys())
        assert u["source_tier"] in tiers
        assert u["permission"] in perms
        assert isinstance(u["is_refinement"], bool)

def test_generator_determinism():
    u1 = generate_updates(seed=555, n=20, m_docs=5, k_users=5)
    u2 = generate_updates(seed=555, n=20, m_docs=5, k_users=5)
    assert u1 == u2
    
def test_generator_variety():
    # Ensure we get some refinements and maybe duplicates
    updates = generate_updates(seed=999, n=100, m_docs=5, k_users=5)
    has_refinement = any(u["is_refinement"] for u in updates)
    assert has_refinement
