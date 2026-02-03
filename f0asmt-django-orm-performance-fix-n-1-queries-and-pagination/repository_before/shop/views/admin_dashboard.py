from django.http import JsonResponse
from django.contrib.admin.views.decorators import staff_member_required
from django.utils import timezone
from datetime import timedelta
from shop.models import Order, Product, OrderItem, Review
from django.contrib.auth.models import User


@staff_member_required
def dashboard_stats(request):
    today = timezone.now().date()
    last_30_days = today - timedelta(days=30)
    last_7_days = today - timedelta(days=7)

    all_orders = Order.objects.all()
    total_revenue = 0
    revenue_30_days = 0
    revenue_7_days = 0
    for order in all_orders:
        total_revenue += float(order.total)
        if order.created_at.date() >= last_30_days:
            revenue_30_days += float(order.total)
        if order.created_at.date() >= last_7_days:
            revenue_7_days += float(order.total)

    total_orders = 0
    orders_30_days = 0
    orders_7_days = 0
    for order in all_orders:
        total_orders += 1
        if order.created_at.date() >= last_30_days:
            orders_30_days += 1
        if order.created_at.date() >= last_7_days:
            orders_7_days += 1

    orders_by_status = {}
    for order in all_orders:
        status = order.status
        if status not in orders_by_status:
            orders_by_status[status] = 0
        orders_by_status[status] += 1

    daily_revenue = {}
    for order in all_orders:
        if order.created_at.date() >= last_30_days:
            date_str = order.created_at.date().isoformat()
            if date_str not in daily_revenue:
                daily_revenue[date_str] = 0
            daily_revenue[date_str] += float(order.total)

    all_products = Product.objects.all()
    total_products = 0
    low_stock_products = []
    out_of_stock_products = []
    for product in all_products:
        total_products += 1
        if product.stock_quantity == 0:
            out_of_stock_products.append({
                'id': product.id,
                'name': product.name,
                'sku': product.sku,
            })
        elif product.stock_quantity <= product.low_stock_threshold:
            low_stock_products.append({
                'id': product.id,
                'name': product.name,
                'sku': product.sku,
                'stock': product.stock_quantity,
                'threshold': product.low_stock_threshold,
            })

    product_sales = {}
    for item in OrderItem.objects.all():
        pid = item.product_id
        if pid not in product_sales:
            product_sales[pid] = {
                'name': item.product_name,
                'quantity': 0,
                'revenue': 0,
            }
        product_sales[pid]['quantity'] += item.quantity
        product_sales[pid]['revenue'] += float(item.total_price)

    top_products = sorted(
        [{'id': pid, **data} for pid, data in product_sales.items()],
        key=lambda x: x['revenue'],
        reverse=True
    )[:10]

    all_users = User.objects.all()
    total_customers = 0
    new_customers_30_days = 0
    for user in all_users:
        total_customers += 1
        if user.date_joined.date() >= last_30_days:
            new_customers_30_days += 1

    pending_reviews = 0
    for review in Review.objects.all():
        if not review.is_approved:
            pending_reviews += 1

    return JsonResponse({
        'revenue': {
            'total': total_revenue,
            'last_30_days': revenue_30_days,
            'last_7_days': revenue_7_days,
            'daily': daily_revenue,
        },
        'orders': {
            'total': total_orders,
            'last_30_days': orders_30_days,
            'last_7_days': orders_7_days,
            'by_status': orders_by_status,
        },
        'products': {
            'total': total_products,
            'low_stock': low_stock_products,
            'out_of_stock': out_of_stock_products,
        },
        'top_products': top_products,
        'customers': {
            'total': total_customers,
            'new_last_30_days': new_customers_30_days,
        },
        'reviews': {
            'pending_approval': pending_reviews,
        },
    })
