from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from django.core.cache import cache
from shop.models import Product, Category, Brand, Tag, ProductImage, Review, Order, OrderItem

# Version keys
PRODUCT_LIST_VERSION_KEY = 'product_list_version'
def get_order_list_version_key(user_id):
    return f'order_list_version_{user_id}'

@receiver([post_save, post_delete], sender=Product)
@receiver([post_save, post_delete], sender=Category)
@receiver([post_save, post_delete], sender=Brand)
@receiver([post_save, post_delete], sender=Tag)
def invalidate_product_list_cache(sender, instance, **kwargs):
    # Increment version to invalidate all product list caches
    try:
        cache.incr(PRODUCT_LIST_VERSION_KEY)
    except ValueError:
        cache.set(PRODUCT_LIST_VERSION_KEY, 1)

@receiver([post_save, post_delete], sender=Product)
def invalidate_product_detail_cache(sender, instance, **kwargs):
    # Invalidate specific product detail
    cache.delete(f'product_detail_{instance.slug}')
    # Also invalidate query-based list (covered by list version)

@receiver([post_save, post_delete], sender=ProductImage)
def invalidate_product_image_cache(sender, instance, **kwargs):
    # Invalidate parent product detail and list
    if instance.product:
        cache.delete(f'product_detail_{instance.product.slug}')
    invalidate_product_list_cache(sender, instance, **kwargs)

@receiver([post_save, post_delete], sender=Review)
def invalidate_review_cache(sender, instance, **kwargs):
    # Invalidate parent product detail (rating/count) and list
    if instance.product:
        cache.delete(f'product_detail_{instance.product.slug}')
    invalidate_product_list_cache(sender, instance, **kwargs)

@receiver([post_save, post_delete], sender=Order)
def invalidate_order_cache(sender, instance, **kwargs):
    # Invalidate order detail
    cache.delete(f'order_detail_{instance.order_number}')
    # Invalidate user's order list
    key = get_order_list_version_key(instance.user_id)
    try:
        cache.incr(key)
    except ValueError:
        cache.set(key, 1)

@receiver([post_save, post_delete], sender=OrderItem)
def invalidate_order_item_cache(sender, instance, **kwargs):
    if instance.order:
        # Invalidate parent order
        invalidate_order_cache(sender, instance.order, **kwargs)
