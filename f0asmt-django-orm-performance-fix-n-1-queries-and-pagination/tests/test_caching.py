import pytest
from django.urls import reverse
from django.core.cache import cache
from shop.models import Product, Category, Brand, Order, OrderItem, ProductImage
from django.contrib.auth.models import User
from decimal import Decimal

@pytest.mark.django_db
def test_product_list_caching(client, django_assert_num_queries):
    category = Category.objects.create(name="Electronics", slug="electronics")
    brand = Brand.objects.create(name="TechCorp", slug="techcorp")
    product = Product.objects.create(
        name="Laptop", slug="laptop", 
        category=category, brand=brand, 
        price=Decimal("1000.00"), stock_quantity=10,
        is_active=True
    )
    url = reverse('product_list')

    # Initial request - should hit DB
    response = client.get(url)
    assert response.status_code == 200

    # Second request - should be cached (0 queries ideally, but middleware/auth might add some if checking session)
    # The view itself should not query products.
    with django_assert_num_queries(0):
        # We need to mock cache or rely on actual cache behavior.
        # Since we use database cache or dummy, we might see queries for cache itself if using db backend.
        # But prompt said "Cache: Redis", so no DB queries for cache.
        # Middleware-related queries (session, user) might occur.
        # However, for pure API view caching, we expect 0 product queries.
        # django_assert_num_queries counts ALL queries.
        # To make this robust, we can just assert response content without strictly 0 if middleware is noisy,
        # BUT the requirement says "Cache query results...".
        # Let's assume redis is working and middleware is quiet enough or verified elsewhere.
        # If this fails due to middleware queries, we might need to adjust.
        # For now, placing the call inside is the correct way to test.
        client.get(url)
    
    # Check cache key exists? 
    # We can't easily predict exact key due to version, but we know prefix.
    
    # Modify product -> invalidate -> next request gets new data
    product.name = "Laptop Pro"
    product.save() # Signals should invalidate
    
    response = client.get(url)
    assert response.json()['products'][0]['name'] == "Laptop Pro"

@pytest.mark.django_db
def test_product_detail_caching(client, django_assert_num_queries):
    category = Category.objects.create(name="Electronics", slug="electronics")
    product = Product.objects.create(
        name="Phone", slug="phone", 
        category=category, price=Decimal("500.00"), stock_quantity=5,
        is_active=True
    )
    url = reverse('product_detail', kwargs={'slug': 'phone'})

    # First fetch
    response = client.get(url)
    assert response.status_code == 200
    
    # Second fetch - should use cache
    # Verify cache key exists directly
    assert cache.get(f"product_detail_phone") is not None
    
    # Test Invalidation
    product.price = Decimal("450.00")
    product.save() # Signal triggers invalidation
    
    assert cache.get(f"product_detail_phone") is None
    
    # Refetch
    response = client.get(url)
    assert response.json()['price'] == "450.00"

@pytest.mark.django_db
def test_order_list_caching(client):
    user = User.objects.create_user(username='testuser', password='password')
    client.force_login(user)
    
    order = Order.objects.create(
        user=user, 
        order_number="ORD-001", 
        total=Decimal("100.00"),
        subtotal=Decimal("80.00"),
        tax=Decimal("10.00"),
        shipping_cost=Decimal("10.00"),
        discount=Decimal("0.00"),
        shipping_address={}, billing_address={}
    )
    url = reverse('order_list')
    
    # First fetch
    client.get(url)
    
    # Modify order - should invalidate list
    order.status = 'shipped'
    order.save()
    
    # Check if we get new status
    response = client.get(url)
    assert response.json()['orders'][0]['status'] == 'shipped'

@pytest.mark.django_db
def test_order_detail_caching(client):
    user = User.objects.create_user(username='testuser2', password='password')
    client.force_login(user)
    
    order = Order.objects.create(
        user=user, 
        order_number="ORD-002", 
        total=Decimal("200.00"),
        subtotal=Decimal("180.00"),
        tax=Decimal("10.00"),
        shipping_cost=Decimal("10.00"),
        discount=Decimal("0.00"),
        shipping_address={}, billing_address={}
    )
    url = reverse('order_detail', kwargs={'order_number': 'ORD-002'})
    
    # First fetch
    client.get(url)
    assert cache.get(f"order_detail_ORD-002") is not None
    
    # Modify order
    order.status = 'delivered'
    order.save()
    
    assert cache.get(f"order_detail_ORD-002") is None
