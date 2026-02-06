"""
Pytest configuration for Celery task tests.
"""
import pytest
import sys
import os

# Determine which repository to use based on PYTHONPATH or default to repository_after
PYTHONPATH = os.environ.get('PYTHONPATH', '')
if 'repository_before' in PYTHONPATH:
    REPO_DIR = 'repository_before'
else:
    REPO_DIR = 'repository_after'

# Add the repository directory to path
repo_path = os.path.join(os.path.dirname(__file__), '..', REPO_DIR)
sys.path.insert(0, repo_path)

# Set Django settings before importing any Django modules
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')


@pytest.fixture(scope='session')
def django_setup():
    """Setup Django for testing."""
    import django
    django.setup()


@pytest.fixture(scope='session')
def django_setup():
    """Setup Django for testing."""
    import django
    django.setup()


@pytest.fixture
def mock_redis():
    """Create a mock Redis client."""
    from unittest.mock import MagicMock
    import redis
    
    mock_client = MagicMock(spec=redis.Redis)
    mock_client.get.return_value = None
    mock_client.setex.return_value = True
    mock_client.hset.return_value = True
    mock_client.hget.return_value = None
    mock_client.hgetall.return_value = {}
    mock_client.pipeline.return_value = MagicMock()
    
    return mock_client


@pytest.fixture
def mock_celery_app():
    """Create a mock Celery app for testing."""
    from celery import Celery
    
    app = Celery('test')
    app.config_from_object({
        'CELERY_TASK_QUEUES': [],
        'CELERY_TASK_ROUTES': {},
        'CELERY_TASK_ACKS_LATE': True,
        'CELERY_WORKER_PREFETCH_MULTIPLIER': 1,
    })
    
    return app


@pytest.fixture
def sample_user():
    """Create a sample user for testing."""
    from unittest.mock import MagicMock
    
    user = MagicMock()
    user.id = 1
    user.username = 'testuser'
    user.email = 'test@example.com'
    user.get_full_name.return_value = 'Test User'
    
    return user


@pytest.fixture
def sample_product():
    """Create a sample product for testing."""
    from unittest.mock import MagicMock
    
    product = MagicMock()
    product.id = 1
    product.sku = 'SKU001'
    product.name = 'Test Product'
    product.price = 10.99
    product.stock = 100
    
    return product


@pytest.fixture
def sample_csv_content():
    """Create sample CSV content for import testing."""
    return """sku,name,price,stock,category_id
SKU001,Product 1,10.99,100,1
SKU002,Product 2,20.99,50,1
SKU003,Product 3,30.99,75,1
"""


@pytest.fixture
def temp_csv_file(sample_csv_content):
    """Create a temporary CSV file for testing."""
    import tempfile
    
    with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False) as f:
        f.write(sample_csv_content)
        temp_path = f.name
    
    yield temp_path
    
    # Cleanup
    os.unlink(temp_path)


def pytest_configure(config):
    """Configure pytest."""
    pass


def pytest_collection_modifyitems(config, items):
    """Modify test collection."""
    pass
