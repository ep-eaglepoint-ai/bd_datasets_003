import pytest
from django.db import connection
@pytest.mark.django_db
def test_indexes_exist():
    from shop.models import Product
    # Only meaningful if we are running against a DB that supports these indexes and they were applied.
    # SQLite might ignore some GIN indexes or treat them differently, but standard indexes should show up.
    
    with connection.cursor() as cursor:
        # Introspection
        constraints = connection.introspection.get_constraints(cursor, Product._meta.db_table)
        
    # We expect indexes on: category, brand, is_active, price
    # And composite: category, price, is_active
    # And GIN: name, description, sku (might not show in sqlite introspection same way, or depends on backend)
    
    # Just print keys to debug if unsure of naming
    # print(constraints.keys())
    
    # Check for standard indexes by field lookups
    index_fields = []
    for name, details in constraints.items():
        if details['index']:
            index_fields.append(tuple(sorted(details['columns'])))
            
    assert ('category_id',) in index_fields
    assert ('brand_id',) in index_fields
    assert ('is_active',) in index_fields
    assert ('price',) in index_fields
    assert ('created_at',) in index_fields
    
    # Composite
    # ('category_id', 'is_active', 'price') - sorted field names? 
    # The constraint introspection returns columns.
    # Check for presence of the composite index columns
    assert tuple(sorted(['category_id', 'price', 'is_active'])) in index_fields

@pytest.mark.django_db
def test_trigram_search_setup():
    from shop.models import Product
    # This test primarily verifies that the code for GIN indexes is in the model
    # and doesn't crash the test runner (even if SQLite ignores them).
    assert Product._meta.indexes
    gin_indexes = [ix for ix in Product._meta.indexes if 'gin' in getattr(ix, 'name', '')]
    assert len(gin_indexes) == 3
