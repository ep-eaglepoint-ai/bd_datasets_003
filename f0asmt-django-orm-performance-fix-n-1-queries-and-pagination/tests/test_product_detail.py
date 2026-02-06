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
    # Create Category and Brand
    cat1 = Category.objects.create(name="Electronics", slug="electronics")
    brand1 = Brand.objects.create(name="TechBrand", slug="techbrand")
    
    # Create Main Product
    p1 = Product.objects.create(
        name="Main Product",
        slug="main-product",
        sku="MAIN001",
        description="Main Desc",
        price=100.00,
        category=cat1,
        brand=brand1,
        stock_quantity=10,
        is_active=True,
        metadata={"key": "value"}
    )
    
    # Create Images for Main
    ProductImage.objects.create(product=p1, image="p1_main.jpg", is_primary=True, sort_order=1)
    ProductImage.objects.create(product=p1, image="p1_side.jpg", is_primary=False, sort_order=2)
    
    # Create Tags
    tag1 = Tag.objects.create(name="Tag1", slug="tag1")
    p1.tags.add(tag1)
    
    # Create Reviews for Main
    user = User.objects.create_user(username="u1", password="pw")
    # 10 approved reviews
    for i in range(10):
        Review.objects.create(
            product=p1, 
            user=User.objects.create_user(username=f"rev{i}"), 
            rating=5, 
            title=f"Review {i}", 
            content="Content", 
            is_approved=True
        )
    # 1 unapproved
    Review.objects.create(product=p1, user=user, rating=1, title="Bad", content="Bad", is_approved=False)
    
    # Create Related Products (Same category, exclude main)
    related = []
    for i in range(5):
        rp = Product.objects.create(
            name=f"Related {i}",
            slug=f"related-{i}",
            sku=f"REL{i}",
            description="Desc",
            price=50.00,
            category=cat1,
            is_active=True
        )
        ProductImage.objects.create(product=rp, image=f"rp{i}.jpg", is_primary=True)
        related.append(rp)
        
    return {
        "p1": p1,
        "related": related
    }

@pytest.mark.django_db
def test_product_detail_query_count(api_client, sample_data, django_assert_num_queries):
    url = reverse('product_detail', kwargs={'slug': sample_data['p1'].slug})
    
    # Expected Queries:
    # 1. Main Product Query (with select_related cat, brand)
    # 2. Prefetch Tags
    # 3. Prefetch Images
    # 4. Prefetch Reviews (custom filtered)
    # 5. Deferred metadata access (accessed in view for JSON response)
    #    - Wait, if we access `product.metadata` and it's deferred, it triggers a query.
    #    - So +1 query for metadata.
    # 6. Related Products Query
    # 7. Prefetch Images for Related Products
    # Total = ~7 queries
    
    # Note: Accessing metadata is intentional per previous logic discussion.
    
    with django_assert_num_queries(7):
        response = api_client.get(url)
    
    assert response.status_code == 200

@pytest.mark.django_db
def test_product_detail_content(api_client, sample_data):
    url = reverse('product_detail', kwargs={'slug': sample_data['p1'].slug})
    response = api_client.get(url)
    data = json.loads(response.content)
    
    assert data['slug'] == 'main-product'
    assert data['name'] == 'Main Product'
    
    # Check stats
    # 10 reviews with 5 stars = 5.0 avg
    assert data['rating'] == 5.0
    assert data['review_count'] == 10
    
    # Check reviews list (limit 10)
    assert len(data['reviews']) == 10
    assert data['reviews'][0]['title'] == 'Review 9' # Ordered by -created_at? Actually created sequentially.
    
    # Check images
    assert len(data['images']) == 2
    
    # Check metadata (was deferred but should be present)
    assert data['metadata'] == {'key': 'value'}

@pytest.mark.django_db
def test_related_products(api_client, sample_data):
    url = reverse('product_detail', kwargs={'slug': sample_data['p1'].slug})
    response = api_client.get(url)
    data = json.loads(response.content)
    
    # Created 5 related, limit is 4
    related = data['related_products']
    assert len(related) == 4
    
    # Verify related product image presence
    assert related[0]['image']['url'] is not None
