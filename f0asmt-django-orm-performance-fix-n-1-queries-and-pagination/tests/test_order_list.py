import pytest
from django.urls import reverse
from shop.models import Order, OrderItem, Product, Category, Brand, ProductImage
from django.contrib.auth.models import User
from django.utils import timezone
import datetime
import json
import base64

@pytest.fixture
def api_client():
    from django.test import Client
    return Client()

@pytest.fixture
def sample_data():
    user = User.objects.create_user(username="u1", password="pw")
    cat = Category.objects.create(name="C1", slug="c1")
    brand = Brand.objects.create(name="B1", slug="b1")
    p1 = Product.objects.create(name="P1", slug="p1", sku="S1", price=10, category=cat, brand=brand, stock_quantity=100)
    ProductImage.objects.create(product=p1, image="p1.jpg", is_primary=True)
    
    orders = []
    # Create 15 orders
    # We want them created spaced out in time so sorting is deterministic and tests are easy.
    base_time = timezone.now() - datetime.timedelta(days=20)
    
    for i in range(15):
        # i=0 -> oldest
        created_at = base_time + datetime.timedelta(days=i)
        
        # Manually create with specific created_at? 
        # Django 'auto_now_add' might override on save.
        # We need to update created_at after creation or use a different method.
        # OR just create them and trust the loop execution time? No, too fast (ms).
        # We can use update()
        
        o = Order.objects.create(
            user=user,
            order_number=f"ORD{i}",
            status="pending" if i % 2 == 0 else "shipped",
            subtotal=10, tax=1, shipping_cost=5, discount=0, total=16,
            shipping_address={"a": 1}, billing_address={"b": 1}
        )
        o.created_at = created_at
        o.save()
        
        OrderItem.objects.create(
             order=o, product=p1, product_name="P1", product_sku="S1", quantity=1, unit_price=10, total_price=10
        )
        orders.append(o)
        
    return {
        "user": user,
        "orders": orders # Order 0 is oldest, Order 14 is newest
    }

@pytest.mark.django_db
def test_order_list_pagination(api_client, sample_data):
    # Log in
    api_client.force_login(sample_data['user'])
    
    url = reverse('order_list')
    
    # 1. First Page (Limit 10). Should get 14 down to 5 (10 items).
    # Sorting: -created_at. So latest first.
    response = api_client.get(url)
    data = json.loads(response.content)
    
    assert len(data['orders']) == 10
    assert data['pagination']['has_next'] is True
    assert data['pagination']['next_cursor'] is not None
    
    # Verify order: Should be ORD14, ORD13 ... ORD5
    assert data['orders'][0]['order_number'] == "ORD14"
    assert data['orders'][9]['order_number'] == "ORD5"
    
    # 2. Next Page
    cursor = data['pagination']['next_cursor']
    response = api_client.get(url + f"?cursor={cursor}")
    data = json.loads(response.content)
    
    # Should contain ORD4 ... ORD0 (5 items)
    assert len(data['orders']) == 5
    assert data['pagination']['has_next'] is False
    assert data['pagination']['next_cursor'] is None
    
    assert data['orders'][0]['order_number'] == "ORD4"
    assert data['orders'][4]['order_number'] == "ORD0"

@pytest.mark.django_db
def test_order_list_filtering(api_client, sample_data):
    api_client.force_login(sample_data['user'])
    url = reverse('order_list')
    
    # Filter by status 'shipped' (odd indices: 1, 3, 5, 7, 9, 11, 13) -> 7 items
    response = api_client.get(url + "?status=shipped")
    data = json.loads(response.content)
    
    assert len(data['orders']) == 7
    for o in data['orders']:
        assert o['status'] == 'shipped'
    
    # Pagination check with filter
    # If we had 11 shipped, we would separate.
    # Currently 7 < 10, so no next page.
    assert data['pagination']['has_next'] is False

@pytest.mark.django_db
def test_order_list_structure(api_client, sample_data):
    api_client.force_login(sample_data['user'])
    url = reverse('order_list')
    response = api_client.get(url)
    data = json.loads(response.content)
    
    order = data['orders'][0]
    # Check fields
    assert 'id' in order
    assert 'total' in order
    assert 'items' in order
    # Verify image url in items
    assert order['items'][0]['product_image'] is not None

@pytest.mark.django_db
def test_order_list_query_count(api_client, sample_data, django_assert_num_queries):
    api_client.force_login(sample_data['user'])
    url = reverse('order_list')
    
    # Expected queries:
    # 1. Session/Auth (handled by middleware usually, but assert_num_queries might count it depending on setup)
    # 2. Main Order Query (LIMIT 11)
    # 3. Prefetch related (items -> product -> images)
    #    - This might be 1 complex query or a few separate ones.
    #    - Items (1 query)
    #    - Product (can be part of Items if select_related, or prefetch)
    #    - Images (prefetch)
    #    - The exact number depends on Django optimization, allow small range.
    #    - We expect CONSTANT queries, not depending on order count (well, page size is fixed).
    
    # Without optimization: 1 main + 10x (items) + 10x (products) + 10x (images) = ~31+ queries.
    # With optimization: 1 main + 1 (items) + 1 (images) + 1 (count for pagination) = ~4-5 queries.
    # Note: We added a COUNT query for backward compatibility (total_count field)
    
    with django_assert_num_queries(7): # Allow some buffer for auth/session + count query
        api_client.get(url)
