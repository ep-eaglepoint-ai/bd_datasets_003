import pytest
from django.urls import reverse
from shop.models import Order, OrderItem, Product, Category, Brand, Review
from django.contrib.auth.models import User
from django.utils import timezone
import datetime
import json
from django.db import connection

@pytest.fixture
def api_client():
    from django.test import Client
    return Client()

@pytest.fixture
def staff_user():
    return User.objects.create_user(username="staff", password="pw", is_staff=True)

@pytest.fixture
def sample_data(staff_user):
    cat = Category.objects.create(name="C1", slug="c1")
    brand = Brand.objects.create(name="B1", slug="b1")
    
    # Products
    # P1: Normal
    p1 = Product.objects.create(name="P1", slug="p1", sku="S1", price=100, category=cat, brand=brand, stock_quantity=100)
    # P2: Low Stock
    p2 = Product.objects.create(name="P2", slug="p2", sku="S2", price=50, category=cat, brand=brand, stock_quantity=5, low_stock_threshold=10)
    # P3: Out of Stock
    p3 = Product.objects.create(name="P3", slug="p3", sku="S3", price=20, category=cat, brand=brand, stock_quantity=0)
    
    # Orders
    now = timezone.now()
    
    # Order 1: Today, $100
    o1 = Order.objects.create(
        user=staff_user, order_number="O1", status="pending",
        subtotal=90.00, tax=5.00, shipping_cost=5.00, discount=0.00, total=100.00,
        shipping_address={"addr": "1"}, billing_address={"addr": "1"}
    )
    o1.created_at = now
    o1.save()
    OrderItem.objects.create(order=o1, product=p1, product_name="P1", product_sku="S1", quantity=1, unit_price=100, total_price=100)
    
    # Order 2: 10 days ago (within 30 days, outside 7 days), $50
    o2 = Order.objects.create(
        user=staff_user, order_number="O2", status="shipped",
        subtotal=45.00, tax=2.50, shipping_cost=2.50, discount=0.00, total=50.00,
        shipping_address={"addr": "1"}, billing_address={"addr": "1"}
    )
    o2.created_at = now - datetime.timedelta(days=10)
    o2.save()
    OrderItem.objects.create(order=o2, product=p2, product_name="P2", product_sku="S2", quantity=1, unit_price=50, total_price=50)

    # Order 3: 40 days ago (old), $20
    o3 = Order.objects.create(
        user=staff_user, order_number="O3", status="completed",
        subtotal=15.00, tax=1.00, shipping_cost=4.00, discount=0.00, total=20.00,
        shipping_address={"addr": "1"}, billing_address={"addr": "1"}
    )
    o3.created_at = now - datetime.timedelta(days=40)
    o3.save()
    OrderItem.objects.create(order=o3, product=p3, product_name="P3", product_sku="S3", quantity=1, unit_price=20, total_price=20)
    
    # Reviews
    Review.objects.create(product=p1, user=staff_user, rating=5, is_approved=False)
    
    # Create another user for second review
    u2 = User.objects.create_user(username="u2", password="pw")
    Review.objects.create(product=p1, user=u2, rating=5, is_approved=True)

    # Customers
    # staff_user joined today (new)
    # create old user
    old_user = User.objects.create_user(username="old", password="pw")
    old_user.date_joined = now - datetime.timedelta(days=50)
    old_user.save()

    return {}

@pytest.mark.django_db
def test_dashboard_stats_content(api_client, staff_user, sample_data):
    api_client.force_login(staff_user)
    url = reverse('dashboard_stats')
    response = api_client.get(url)
    data = json.loads(response.content)
    
    # Revenue
    # Total: 100 + 50 + 20 = 170
    assert data['revenue']['total'] == 170.0
    # 30 days: 100 + 50 = 150
    assert data['revenue']['last_30_days'] == 150.0
    # 7 days: 100 (today)
    assert data['revenue']['last_7_days'] == 100.0
    
    # Orders
    assert data['orders']['total'] == 3
    assert data['orders']['last_30_days'] == 2
    assert data['orders']['last_7_days'] == 1
    assert data['orders']['by_status']['pending'] == 1
    assert data['orders']['by_status']['shipped'] == 1
    
    # Products
    assert data['products']['total'] == 3
    assert len(data['products']['low_stock']) == 1
    assert data['products']['low_stock'][0]['name'] == 'P2'
    assert len(data['products']['out_of_stock']) == 1
    assert data['products']['out_of_stock'][0]['name'] == 'P3'
    
    # Top Products
    # P1: 100, P2: 50, P3: 20
    assert len(data['top_products']) == 3
    assert data['top_products'][0]['name'] == 'P1'
    assert data['top_products'][0]['revenue'] == 100.0
    
    # Customers
    # 3 users total: staff_user, old_user, u2
    # staff_user (new), u2 (new), old_user (old)
    assert data['customers']['total'] == 3
    assert data['customers']['new_last_30_days'] == 2
    
    # Reviews
    assert data['reviews']['pending_approval'] == 1

@pytest.mark.django_db
def test_dashboard_query_count(api_client, staff_user, sample_data, django_assert_num_queries):
    api_client.force_login(staff_user)
    url = reverse('dashboard_stats')
    
    # Expected Queries:
    # 1. Auth/Session
    # 2. Revenue & Order Aggregates (1 query)
    # 3. Status breakdown (1 query)
    # 4. Daily revenue (1 query)
    # 5. Product Count (1 query)
    # 6. Out of stock (1 query)
    # 7. Low stock (1 query)
    # 8. Top products (1 query)
    # 9. Customer totals (2 queries: Total, New) - ORM might optimize count if using count() directly
    # 10. Reviews (1 query)
    # Total ~10-12 queries. Should be CONSTANT, not O(N).
    
    # Without optimization:
    # It was looping orders (N), items (N), products (N), users (N).
    # With optimization:
    # It should be a fixed set of aggregation queries.
    
    with django_assert_num_queries(12):
        api_client.get(url)
