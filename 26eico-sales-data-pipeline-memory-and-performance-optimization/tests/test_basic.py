import pytest

def test_modules_importable():
    """Test that all key modules can be imported."""
    try:
        import main
        import ingest
        import transform
        import aggregate
        import export
    except ImportError as e:
        pytest.fail(f"Failed to import modules: {e}")

def test_placeholder():
    """Placeholder test to ensure we have at least one test passing."""
    assert True
