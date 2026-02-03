from django.shortcuts import render, get_object_or_404
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from shop.models import Order, OrderItem, ProductImage


@login_required
def order_list(request):
    orders = Order.objects.filter(user=request.user)

    status = request.GET.get('status')
    if status:
        orders = orders.filter(status=status)

    date_from = request.GET.get('date_from')
    if date_from:
        orders = orders.filter(created_at__date__gte=date_from)

    date_to = request.GET.get('date_to')
    if date_to:
        orders = orders.filter(created_at__date__lte=date_to)

    all_orders = list(orders.order_by('-created_at'))

    per_page = 10
    page = int(request.GET.get('page', 1))
    total_count = len(all_orders)
    total_pages = (total_count + per_page - 1) // per_page

    start = (page - 1) * per_page
    end = start + per_page
    paginated_orders = all_orders[start:end]

    order_data = []
    for order in paginated_orders:
        items = order.items.all()
        item_data = []
        for item in items:
            product = item.product
            image = product.images.filter(is_primary=True).first()
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

    return JsonResponse({
        'orders': order_data,
        'pagination': {
            'current_page': page,
            'total_pages': total_pages,
            'total_count': total_count,
            'has_next': page < total_pages,
            'has_previous': page > 1,
        }
    })


@login_required
def order_detail(request, order_number):
    order = get_object_or_404(Order, order_number=order_number, user=request.user)

    items = order.items.all()
    item_data = []
    for item in items:
        product = item.product
        image = product.images.filter(is_primary=True).first()
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

    return JsonResponse({
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
