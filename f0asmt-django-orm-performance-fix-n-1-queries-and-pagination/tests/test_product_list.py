import pytest
from django.urls import reverse
from shop.models import Product, Category, Brand, Tag, ProductImage, Review
from django.contrib.auth.models import User
import json

@pytest.fixture
def api_client():
    from django.test import Client
    return Client()

@pytest.fixture
def sample_data():
    # Create Categories
    cat1 = Category.objects.create(name="Electronics", slug="electronics")
    cat2 = Category.objects.create(name="Books", slug="books")

    # Create Brand
    brand1 = Brand.objects.create(name="TechBrand", slug="techbrand")

    # Create Tags
    tag1 = Tag.objects.create(name="New", slug="new")
    tag2 = Tag.objects.create(name="Sale", slug="sale")

    # Create Products
    p1 = Product.objects.create(
        name="Laptop",
        slug="laptop",
        sku="LP100",
        description="A great laptop",
        price=1000.00,
        category=cat1,
        brand=brand1,
        stock_quantity=10,
        is_active=True
    )
    p1.tags.add(tag1, tag2)

    p2 = Product.objects.create(
        name="E-Book Reader",
        slug="ebook-reader",
        sku="EB200",
        description="Read books",
        price=150.00,
        category=cat1,
        stock_quantity=5,
        is_active=True,
        compare_at_price=200.00
    )
    p2.tags.add(tag1)

    p3 = Product.objects.create(
        name="Novel",
        slug="novel",
        sku="NV300",
        description="A fiction book",
        price=20.00,
        category=cat2,
        stock_quantity=0,
        is_active=True
    )

    # Create Images
    ProductImage.objects.create(product=p1, image="p1_main.jpg", is_primary=True)
    ProductImage.objects.create(product=p1, image="p1_side.jpg", is_primary=False)
    ProductImage.objects.create(product=p2, image="p2_main.jpg", is_primary=True)

    # Create Reviews
    user = User.objects.create_user(username="testuser", password="password")
    
    # P1: 2 reviews approved, 1 unapproved
    Review.objects.create(product=p1, user=user, rating=5, title="Great", content="Love it", is_approved=True)
    Review.objects.create(product=p1, user=User.objects.create_user(username="u2"), rating=4, title="Good", content="Nice", is_approved=True)
    Review.objects.create(product=p1, user=User.objects.create_user(username="u3"), rating=1, title="Bad", content="Boo", is_approved=False)

    return {
        "cat1": cat1,
        "cat2": cat2,
        "brand1": brand1,
        "p1": p1,
        "p2": p2,
        "p3": p3
    }

@pytest.mark.django_db
def test_product_list_query_count(api_client, sample_data, django_assert_num_queries):
    url = reverse('product_list')
    
    # Expected queries:
    # 1. Recursive count for pagination (Wait, Paginator.count might optimize?)
    #    - If using simple count(), it's 1 query.
    # 2. Main query for products (LIMIT 20) with joins for Category, Brand.
    # 3. Tags prefetch (1 query for all products in page).
    # 4. Images prefetch (1 query for all products in page).
    # Total = ~4 queries.
    
    # Let's perform the request and count. 
    # django_assert_num_queries needs an exact number or a context manager.
    
    with django_assert_num_queries(4):
        response = api_client.get(url)
    
    assert response.status_code == 200
    data = json.loads(response.content)
    assert len(data['products']) == 3

@pytest.mark.django_db
def test_product_list_content_correctness(api_client, sample_data):
    url = reverse('product_list')
    response = api_client.get(url)
    data = json.loads(response.content)
    
    p1_data = next(p for p in data['products'] if p['id'] == sample_data['p1'].id)
    
    # Verify Annotation for Rating
    # P1 has 5 and 4 approved rating => avg expectation: 4.5
    assert p1_data['rating'] == 4.5
    assert p1_data['review_count'] == 2
    
    # Verify Images (Prefetched)
    assert len(p1_data['images']) == 2
    assert p1_data['primary_image']['url'].endswith('p1_main.jpg')
    
    # Verify Tags (Prefetched)
    assert len(p1_data['tags']) == 2

    # Verify Defer
    # We can't easily check if it was deferred from response, but if we accessed it in view it would trigger query.
    # Since we asserted num queries is low, we know we didn't trigger extra loads.

@pytest.mark.django_db
def test_filtering_category(api_client, sample_data):
    url = reverse('product_list') + f"?category={sample_data['cat1'].slug}"
    response = api_client.get(url)
    data = json.loads(response.content)
    
    assert len(data['products']) == 2
    slugs = [p['slug'] for p in data['products']]
    assert 'laptop' in slugs
    assert 'ebook-reader' in slugs
    assert 'novel' not in slugs

@pytest.mark.django_db
def test_filtering_brand(api_client, sample_data):
    url = reverse('product_list') + f"?brand={sample_data['brand1'].slug}"
    response = api_client.get(url)
    data = json.loads(response.content)
    
    assert len(data['products']) == 1
    assert data['products'][0]['slug'] == 'laptop'

@pytest.mark.django_db
def test_filtering_price(api_client, sample_data):
    url = reverse('product_list') + "?min_price=50&max_price=200"
    response = api_client.get(url)
    data = json.loads(response.content)
    
    assert len(data['products']) == 1
    assert data['products'][0]['slug'] == 'ebook-reader'

@pytest.mark.django_db
def test_filtering_in_stock(api_client, sample_data):
    url = reverse('product_list') + "?in_stock=true"
    response = api_client.get(url)
    data = json.loads(response.content)
    
    # p3 has 0 stock
    assert len(data['products']) == 2
    slugs = [p['slug'] for p in data['products']]
    assert 'novel' not in slugs

@pytest.mark.django_db
def test_filtering_on_sale(api_client, sample_data):
    url = reverse('product_list') + "?on_sale=true"
    response = api_client.get(url)
    data = json.loads(response.content)
    
    # Only p2 is on sale (compare 200 > price 150)
    assert len(data['products']) == 1
    assert data['products'][0]['slug'] == 'ebook-reader'

@pytest.mark.django_db
def test_sorting(api_client, sample_data):
    # Sort by price ascending
    url = reverse('product_list') + "?sort=price"
    response = api_client.get(url)
    data = json.loads(response.content)
    prices = [float(p['price']) for p in data['products']]
    assert prices == [20.0, 150.0, 1000.0]

    # Sort by price descending
    url = reverse('product_list') + "?sort=-price"
    response = api_client.get(url)
    data = json.loads(response.content)
    prices = [float(p['price']) for p in data['products']]
    assert prices == [1000.0, 150.0, 20.0]

@pytest.mark.django_db
def test_pagination(api_client, sample_data):
    # Force paginator to 1 item per page by mocking Paginator? 
    # Or just rely on verify the structure exists since we have 3 items and default 20.
    # Let's verify metadata.
    url = reverse('product_list')
    response = api_client.get(url)
    data = json.loads(response.content)
    
    assert data['pagination']['total_count'] == 3
    assert data['pagination']['total_pages'] == 1
    assert data['pagination']['has_next'] is False
