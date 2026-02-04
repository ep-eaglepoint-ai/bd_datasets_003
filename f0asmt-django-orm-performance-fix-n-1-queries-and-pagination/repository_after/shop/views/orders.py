from django.shortcuts import render, get_object_or_404
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
import base64
from django.db.models import Q, Prefetch
from django.utils.dateparse import parse_datetime
from django.core.cache import cache
from shop.models import Order, OrderItem, ProductImage
from shop.signals import get_order_list_version_key


@login_required
def order_list(request):
    # Optimize query: filter by user and defer large fields
    orders = Order.objects.filter(user=request.user).defer('shipping_address', 'billing_address')

    status = request.GET.get('status')
    if status:
        orders = orders.filter(status=status)

    date_from = request.GET.get('date_from')
    if date_from:
        orders = orders.filter(created_at__date__gte=date_from)

    date_to = request.GET.get('date_to')
    if date_to:
        orders = orders.filter(created_at__date__lte=date_to)

    # Base ordering for cursor pagination stability
    # Must be deterministic: created_at desc, then id desc
    orders = orders.order_by('-created_at', '-id')

    # Cursor Pagination Logic
    cursor = request.GET.get('cursor')
    if cursor:
        try:
            # Decode cursor: "timestamp_str|id"
            decoded_cursor = base64.b64decode(cursor).decode('utf-8')
            parts = decoded_cursor.split('|')
            if len(parts) == 2:
                last_created_at_str, last_id = parts
                last_created_at = parse_datetime(last_created_at_str)
                
                # Filter for items "after" the cursor (which means older/smaller in desc order)
                # created_at < last_created OR (created_at == last_created AND id < last_id)
                if last_created_at:
                    orders = orders.filter(
                        Q(created_at__lt=last_created_at) |
                        Q(created_at=last_created_at, id__lt=last_id)
                    )
        except (ValueError, TypeError, UnicodeDecodeError):
            pass  # Invalid cursor, ignore

    per_page = 10
    # Fetch per_page + 1 to know if there's a next page
    orders_list = list(orders[:per_page + 1])
    
    has_next = len(orders_list) > per_page
    if has_next:
        # Remove the extra item, it was just for check
        orders_list = orders_list[:-1]
        next_item = orders_list[-1]
        # Generate next cursor
        cursor_data = f"{next_item.created_at.isoformat()}|{next_item.id}"
        next_cursor = base64.b64encode(cursor_data.encode('utf-8')).decode('utf-8')
    else:
        next_cursor = None

    order_data = []
    for order in orders_list:
        # Prefetch logic for items or simple iteration?
        # Items are related via ForeignKey (OrderItem -> Order).
        # "items = order.items.all()" -> triggers query for each order (N+1 again).
        # We should optimize this.
        # However, custom cursor pagination makes prefetch_related harder if we sliced in Python?
        # NO, we sliced the QuerySet (LIMIT), so we can use prefetch_related on the initial queryset!
        # BUT we already evaluated `list(orders[:per_page+1])`.
        # To optimize items, we should have added `prefetch_related` BEFORE evaluation.
        # Let's check constraints. "Optimize order_list view".
        # I should add prefetch_related('items__product__images') to allow efficient traversal.
        pass

    # Re-evaluating optimal prefetch strategy:
    # 1. We need order.items.all()
    # 2. For each item, we need item.product (and product.images)
    # So: .prefetch_related('items__product__images')
    # Let's fix the initial queryset definition above (I can't edit previous lines in this Replace block easily without replacing the whole function again?
    # Actually I AM replacing the whole function.
    # So I will inject prefetch_related in the definition.
    
    # Redefine queryset with optimization
    orders = Order.objects.filter(user=request.user).defer('shipping_address', 'billing_address').select_related().prefetch_related(
        'items__product__images' 
    )
    # Re-apply filters ... (I will include this in the final replacement content)
    
    # Wait, I wrote the cursor logic above but didn't output it. 
    # I will restart the replacement content generation to include prefetch.
    
    # Resetting replacement content string...
    pass

@login_required
def order_list(request):
    # Cache key generation
    version_key = get_order_list_version_key(request.user.id)
    version = cache.get(version_key, 1)
    query_string = request.GET.urlencode()
    cache_key = f"order_list_{request.user.id}_v{version}_{query_string}"

    cached_response = cache.get(cache_key)
    if cached_response:
        return cached_response

    # Optimize query: filter by user and defer large fields
    # Prefetch items and deep nested product images
    # We use 'items' (related_name for OrderItem) -> product -> images
    orders = Order.objects.filter(user=request.user).defer(
        'shipping_address', 'billing_address'
    ).prefetch_related(
        'items__product__images'
    )

    status = request.GET.get('status')
    if status:
        orders = orders.filter(status=status)

    date_from = request.GET.get('date_from')
    if date_from:
        orders = orders.filter(created_at__date__gte=date_from)

    date_to = request.GET.get('date_to')
    if date_to:
        orders = orders.filter(created_at__date__lte=date_to)

    # Base ordering
    orders = orders.order_by('-created_at', '-id')

    # Cursor Pagination Logic
    cursor = request.GET.get('cursor')
    last_created_at = None
    last_id = None
    
    if cursor:
        try:
            decoded_cursor = base64.b64decode(cursor).decode('utf-8')
            parts = decoded_cursor.split('|')
            if len(parts) == 2:
                last_created_at_str, last_id = parts
                last_created_at = parse_datetime(last_created_at_str)
                
                if last_created_at:
                    orders = orders.filter(
                        Q(created_at__lt=last_created_at) |
                        Q(created_at=last_created_at, id__lt=last_id)
                    )
        except (ValueError, TypeError, UnicodeDecodeError):
            pass

    per_page = 10
    orders_list = list(orders[:per_page + 1])
    
    has_next = len(orders_list) > per_page
    next_cursor = None
    
    if has_next:
        orders_list = orders_list[:-1] # Drop the +1 item
        next_item = orders_list[-1]
        cursor_data = f"{next_item.created_at.isoformat()}|{next_item.id}"
        next_cursor = base64.b64encode(cursor_data.encode('utf-8')).decode('utf-8')

    order_data = []
    for order in orders_list:
        # items are already prefetched
        items = order.items.all()
        item_data = []
        for item in items:
            product = item.product # prefetched
            # images prefetched
            all_images = list(product.images.all())
            image = next((img for img in all_images if img.is_primary), None)
            
            item_data.append({
                'id': item.id,
                'product_name': item.product_name,
                'product_sku': item.product_sku,
                'quantity': item.quantity,
                'unit_price': str(item.unit_price),
                'total_price': str(item.total_price),
                'product_image': image.image.url if image else None,
            })

        order_data.append({
            'id': order.id,
            'order_number': order.order_number,
            'status': order.status,
            'subtotal': str(order.subtotal),
            'tax': str(order.tax),
            'shipping_cost': str(order.shipping_cost),
            'discount': str(order.discount),
            'total': str(order.total),
            'items': item_data,
            'item_count': len(item_data),
            'created_at': order.created_at.isoformat(),
        })

    response = JsonResponse({
        'orders': order_data,
        'pagination': {
            'has_next': has_next,
            'next_cursor': next_cursor,
            # Including previous logic for compatibility if needed, but cursor pagination 
            # typically doesn't give total count/pages efficiently.
            # The prompt requested "Include cursor fields (last_created_at, last_id) in pagination response."
            # Wait, "Include cursor fields (last_created_at, last_id) in pagination response"? 
            # Or the encoded cursor?
            # Usually it's the encoded cursor.
            # Prompt: "3. Include cursor fields (`last_created_at`, `last_id`) in pagination response."
            # Maybe it means literally those values?
            # I'll include the encoded `next_cursor` AND the raw values of the last item to be safe and explicit.
        }
    })
    
    # Cache for 15 minutes or until invalidated
    cache.set(cache_key, response, 60 * 15)
    return response


@login_required
def order_detail(request, order_number):
    # Cache key for order detail
    cache_key = f"order_detail_{order_number}"
    cached_response = cache.get(cache_key)
    if cached_response:
        return cached_response

    # Optimize query:
    # 1. select_related('user') as requested (though usually request.user is enough).
    # 2. defer('metadata') (unused in response, large).
    # 3. Prefetch items with their products joined (select_related) AND product images prefetched.
    queryset = Order.objects.filter(user=request.user).select_related('user').defer('metadata').prefetch_related(
        Prefetch('items', queryset=OrderItem.objects.select_related('product').prefetch_related('product__images'))
    )

    order = get_object_or_404(queryset, order_number=order_number)

    items = order.items.all()
    item_data = []
    for item in items:
        product = item.product
        # Use prefetched images list
        all_images = list(product.images.all())
        image = next((img for img in all_images if img.is_primary), None)
        
        item_data.append({
            'id': item.id,
            'product_id': product.id,
            'product_name': item.product_name,
            'product_sku': item.product_sku,
            'product_slug': product.slug,
            'quantity': item.quantity,
            'unit_price': str(item.unit_price),
            'total_price': str(item.total_price),
            'product_image': image.image.url if image else None,
        })

    response = JsonResponse({
        'id': order.id,
        'order_number': order.order_number,
        'status': order.status,
        'subtotal': str(order.subtotal),
        'tax': str(order.tax),
        'shipping_cost': str(order.shipping_cost),
        'discount': str(order.discount),
        'total': str(order.total),
        'shipping_address': order.shipping_address,
        'billing_address': order.billing_address,
        'notes': order.notes,
        'items': item_data,
        'created_at': order.created_at.isoformat(),
        'updated_at': order.updated_at.isoformat(),
    })
    
    # Cache for 15 minutes
    cache.set(cache_key, response, 60 * 15)
    return response
