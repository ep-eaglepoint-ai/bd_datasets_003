from django.shortcuts import render, get_object_or_404
from django.core.paginator import Paginator
from django.http import JsonResponse
from django.db.models import Q, F, Avg, Count, Prefetch
from django.core.cache import cache
from shop.models import Product, Category, Brand, Tag, ProductImage, Review
from shop.signals import PRODUCT_LIST_VERSION_KEY


def product_list(request):
    # Cache key generation
    version = cache.get(PRODUCT_LIST_VERSION_KEY, 1)
    query_string = request.GET.urlencode()
    cache_key = f"product_list_v{version}_{query_string}"
    
    cached_response = cache.get(cache_key)
    if cached_response:
        return cached_response

    # Base queryset with Select Related and Defer
    products = Product.objects.filter(is_active=True).select_related(
        'category',
        'brand'
    ).defer('metadata')

    # Annotate with Avg Rating and Review Count
    # Filter for only approved reviews for the calculation
    products = products.annotate(
        avg_rating=Avg('reviews__rating', filter=Q(reviews__is_approved=True)),
        review_count=Count('reviews', filter=Q(reviews__is_approved=True))
    )

    # Prefetch Related
    products = products.prefetch_related(
        'tags',
        'images'
    )

    category_slug = request.GET.get('category')
    if category_slug:
        # We can't use get_object_or_404 on the related object easily without a separate query
        # or assuming it exists. To keep it robust but optimized, we can stick to filter logic
        # OR fetch it once if we need the object for other context (not shown here).
        # The original code did get_object_or_404, implying it wants 404 if invalid.
        # We will keep that behavior.
        category = get_object_or_404(Category, slug=category_slug)
        products = products.filter(category=category)

    brand_slug = request.GET.get('brand')
    if brand_slug:
        brand = get_object_or_404(Brand, slug=brand_slug)
        products = products.filter(brand=brand)

    min_price = request.GET.get('min_price')
    if min_price:
        products = products.filter(price__gte=min_price)

    max_price = request.GET.get('max_price')
    if max_price:
        products = products.filter(price__lte=max_price)

    search = request.GET.get('search')
    if search:
        products = products.filter(
            Q(name__icontains=search) |
            Q(description__icontains=search) |
            Q(sku__icontains=search)
        )

    in_stock = request.GET.get('in_stock')
    if in_stock == 'true':
        products = products.filter(stock_quantity__gt=0)

    on_sale = request.GET.get('on_sale')
    if on_sale == 'true':
        products = products.filter(compare_at_price__isnull=False, compare_at_price__gt=F('price'))

    sort = request.GET.get('sort', '-created_at')
    if sort in ['price', '-price', 'name', '-name', 'created_at', '-created_at']:
        products = products.order_by(sort)

    paginator = Paginator(products, 20)
    page = request.GET.get('page', 1)
    products_page = paginator.get_page(page)

    product_data = []
    for product in products_page:
        # Use simple access (already select_related)
        category = product.category
        brand = product.brand
        
        # Optimize Image access using prefetched list
        # We can't use .filter() on product.images because that would trigger a new DB query
        # We must iterate the prefetched list in Python
        all_images = list(product.images.all())
        primary_image = next((img for img in all_images if img.is_primary), None)
        # If no explicit primary, maybe fallback to first? Original code: 
        # return self.images.filter(is_primary=True).first()
        # So yes, just that.

        tags = list(product.tags.all())
        
        # Use annotated values
        avg_rating = product.avg_rating
        review_count = product.review_count

        product_data.append({
            'id': product.id,
            'name': product.name,
            'slug': product.slug,
            'sku': product.sku,
            'price': str(product.price),
            'compare_at_price': str(product.compare_at_price) if product.compare_at_price else None,
            'category': {'id': category.id, 'name': category.name, 'slug': category.slug},
            'brand': {'id': brand.id, 'name': brand.name, 'slug': brand.slug} if brand else None,
            'primary_image': {'url': primary_image.image.url, 'alt': primary_image.alt_text} if primary_image else None,
            'images': [{'url': img.image.url, 'alt': img.alt_text} for img in all_images],
            'stock_quantity': product.stock_quantity,
            'is_featured': product.is_featured,
            'rating': avg_rating,
            'review_count': review_count,
            'tags': [{'id': tag.id, 'name': tag.name} for tag in tags],
            'is_on_sale': product.is_on_sale(),
            'discount_percentage': product.get_discount_percentage(),
        })

    response = JsonResponse({
        'products': product_data,
        'pagination': {
            'current_page': products_page.number,
            'total_pages': paginator.num_pages,
            'total_count': paginator.count,
            'has_next': products_page.has_next(),
            'has_previous': products_page.has_previous(),
        }
    })
    
    # Cache for 15 minutes (or until invalidated)
    cache.set(cache_key, response, 60 * 15)
    return response


def product_detail(request, slug):
    # Cache for detail view
    cache_key = f"product_detail_{slug}"
    cached_response = cache.get(cache_key)
    if cached_response:
        return cached_response

    # Base queryset with Select Related and Defer
    # We use prefetch_related with a custom Prefetch for reviews to filter them and order them.
    # Note: We are prefetching all approved reviews here as per instructions. 
    # For very large datasets, a separate query with Limit is usually better, but this follows "prefetch_related" instruction.
    queryset = Product.objects.filter(is_active=True).select_related(
        'category',
        'brand'
    ).prefetch_related(
        'tags',
        'images',
        Prefetch('reviews', queryset=Review.objects.filter(is_approved=True).select_related('user').order_by('-created_at'), to_attr='approved_reviews')
    ).annotate(
        avg_rating=Avg('reviews__rating', filter=Q(reviews__is_approved=True)),
        review_count=Count('reviews', filter=Q(reviews__is_approved=True))
    ).defer('metadata')

    product = get_object_or_404(queryset, slug=slug)

    # Access prefetched data
    category = product.category
    brand = product.brand
    images = list(product.images.all())
    tags = list(product.tags.all())

    # Use prefetched reviews (in memory)
    all_reviews = product.approved_reviews
    
    # Slice using python list slicing since we have them all
    reviews_slice = all_reviews[:10]
    
    # Use annotated stats
    avg_rating = product.avg_rating
    review_count = product.review_count

    review_data = []
    for review in reviews_slice:
        review_data.append({
            'id': review.id,
            'rating': review.rating,
            'title': review.title,
            'content': review.content,
            'user': review.user.username,
            'created_at': review.created_at.isoformat(),
            'is_verified': review.is_verified_purchase,
        })

    # Optimized Related Products Query
    # We must prefetch images to avoid N+1 in the loop
    # NOTE: We generally can't cache related products easily INSIDE this key if they change state,
    # but signal invalidation on ANY product update clears this cache if logic is aggressive or versioned.
    # For now we assume related products list is part of this product's page snapshot.
    related_products = Product.objects.filter(
        category=product.category,
        is_active=True
    ).exclude(id=product.id).prefetch_related('images')[:4]

    related_data = []
    for rp in related_products:
        # Use Python iteration for images to leverage prefetch
        rp_images = list(rp.images.all())
        rp_image = next((img for img in rp_images if img.is_primary), None)
        
        related_data.append({
            'id': rp.id,
            'name': rp.name,
            'slug': rp.slug,
            'price': str(rp.price),
            'image': {'url': rp_image.image.url, 'alt': rp_image.alt_text} if rp_image else None,
        })

    response = JsonResponse({
        'id': product.id,
        'name': product.name,
        'slug': product.slug,
        'sku': product.sku,
        'description': product.description,
        'short_description': product.short_description,
        'price': str(product.price),
        'compare_at_price': str(product.compare_at_price) if product.compare_at_price else None,
        'category': {'id': category.id, 'name': category.name, 'slug': category.slug},
        'brand': {'id': brand.id, 'name': brand.name, 'slug': brand.slug} if brand else None,
        'images': [{'url': img.image.url, 'alt': img.alt_text, 'is_primary': img.is_primary} for img in images],
        'stock_quantity': product.stock_quantity,
        'is_featured': product.is_featured,
        'rating': avg_rating,
        'review_count': review_count,
        'tags': [{'id': tag.id, 'name': tag.name} for tag in tags],
        # metadata is deferred, accessing it would trigger query. 
        # But we need it for display according to original code: accessing directly `product.metadata`.
        # Wait, the prompt said: "Defer large JSON fields (metadata) not needed for display."
        # BUT checking original code line 160: `'metadata': product.metadata,`
        # It IS in the response.
        # "Defer large JSON fields (metadata) not needed for display" implies we should NOT include it?
        # OR "Exclude large JSON fields (metadata) using .defer()."
        # AND "Ensure the JSON response structure remains unchanged."
        # This is contradictory if the original response included it.
        # Let's check the prompt again: "Defer large JSON fields (metadata) not needed for display."
        # If it IS in the JSON response, it IS needed for display (technically).
        # However, oftentimes metadata is huge and maybe the user meant "if not needed".
        # But "Ensure the JSON response structure remains unchanged" means I MUST include it.
        # If I include it, and it was deferred, it will trigger a separate query.
        # That means 1 extra query. 
        # Requirement 4: "Defer large JSON fields (`metadata`) not needed for display."
        # Requirement 5: "Ensure the JSON response structure remains unchanged."
        # If I remove it from JSON, I violate #5.
        # If I keep it in JSON but defer it, I trigger an extra query, but maybe that's the intent? (Lazy load?)
        # Or maybe the user THINKS it's not needed, but it is in the code.
        # I will keep it in the JSON to satisfy #5. If it triggers a query, so be it, or I assume the user implies removing it from JSON too?
        # "Defer ... not needed for display" -> strongly suggests it shouldn't be in the response.
        # I will OMIT it from the JSON response and update the `product_detail` functionality?
        # NO, "Ensure the JSON response structure remains unchanged" is explicit.
        # I'll stick to maintaining structure. Accessing `product.metadata` will trigger the deferred load.
        # Is there any way to respect both? Only if `metadata` key in JSON was None or empty?
        # I will trust "structure remains unchanged" as the stronger constraint for API contracts.
        # I will include it.
        'metadata': product.metadata,
        'reviews': review_data,
        'related_products': related_data,
    })
    
    # Cache for 15 minutes
    cache.set(cache_key, response, 60 * 15)
    return response
