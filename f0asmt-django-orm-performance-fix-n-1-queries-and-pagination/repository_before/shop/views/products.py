from django.shortcuts import render, get_object_or_404
from django.core.paginator import Paginator
from django.http import JsonResponse
from django.db.models import Q, F
from shop.models import Product, Category, Brand, Tag, ProductImage, Review


def product_list(request):
    products = Product.objects.filter(is_active=True)

    category_slug = request.GET.get('category')
    if category_slug:
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
        category = product.category
        brand = product.brand
        primary_image = product.get_primary_image()
        all_images = list(product.get_all_images())
        tags = list(product.tags.all())
        reviews = product.reviews.filter(is_approved=True)
        avg_rating = None
        review_count = reviews.count()
        if review_count > 0:
            total_rating = sum(r.rating for r in reviews)
            avg_rating = total_rating / review_count

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

    return JsonResponse({
        'products': product_data,
        'pagination': {
            'current_page': products_page.number,
            'total_pages': paginator.num_pages,
            'total_count': paginator.count,
            'has_next': products_page.has_next(),
            'has_previous': products_page.has_previous(),
        }
    })


def product_detail(request, slug):
    product = get_object_or_404(Product, slug=slug, is_active=True)

    category = product.category
    brand = product.brand
    images = list(product.images.all())
    tags = list(product.tags.all())

    reviews = product.reviews.filter(is_approved=True).order_by('-created_at')[:10]
    all_reviews = product.reviews.filter(is_approved=True)
    review_count = all_reviews.count()
    avg_rating = None
    if review_count > 0:
        total_rating = sum(r.rating for r in all_reviews)
        avg_rating = total_rating / review_count

    review_data = []
    for review in reviews:
        review_data.append({
            'id': review.id,
            'rating': review.rating,
            'title': review.title,
            'content': review.content,
            'user': review.user.username,
            'created_at': review.created_at.isoformat(),
            'is_verified': review.is_verified_purchase,
        })

    related_products = Product.objects.filter(
        category=product.category,
        is_active=True
    ).exclude(id=product.id)[:4]

    related_data = []
    for rp in related_products:
        rp_image = rp.get_primary_image()
        related_data.append({
            'id': rp.id,
            'name': rp.name,
            'slug': rp.slug,
            'price': str(rp.price),
            'image': {'url': rp_image.image.url, 'alt': rp_image.alt_text} if rp_image else None,
        })

    return JsonResponse({
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
        'metadata': product.metadata,
        'reviews': review_data,
        'related_products': related_data,
    })
