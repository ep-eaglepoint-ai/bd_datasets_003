import pytest
from django.urls import reverse
from shop.models import Order, OrderItem, Product, Category, Brand, ProductImage
from django.contrib.auth.models import User
import json

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
    
    o = Order.objects.create(
        user=user,
        order_number="ORD001",
        status="pending",
        subtotal=10, tax=1, shipping_cost=5, discount=0, total=16,
        shipping_address={"addr": "123 St"}, billing_address={"bill": "456 Rd"},
        metadata={"heavy": "data"}
    )
    
    OrderItem.objects.create(
         order=o, product=p1, product_name="P1", product_sku="S1", quantity=1, unit_price=10, total_price=10
    )
        
    return {
        "user": user,
        "order": o
    }

@pytest.mark.django_db
def test_order_detail_content(api_client, sample_data):
    api_client.force_login(sample_data['user'])
    url = reverse('order_detail', kwargs={'order_number': sample_data['order'].order_number})
    
    response = api_client.get(url)
    data = json.loads(response.content)
    
    assert data['order_number'] == "ORD001"
    assert data['shipping_address'] == {"addr": "123 St"}
    assert len(data['items']) == 1
    assert data['items'][0]['product_name'] == "P1"
    assert data['items'][0]['product_image'] is not None

@pytest.mark.django_db
def test_order_detail_query_count(api_client, sample_data, django_assert_num_queries):
    api_client.force_login(sample_data['user'])
    url = reverse('order_detail', kwargs={'order_number': sample_data['order'].order_number})
    
    # Expected queries:
    # 1. Auth/Session buffer (optional)
    # 2. Main Order Query (with select_related user)
    # 3. Items + Product (1 query via Prefetch select_related)
    # 4. Product Images (1 query)
    # Total roughly 3-4 (plus auth).
    
    with django_assert_num_queries(5): # Allow buffer
        api_client.get(url)
