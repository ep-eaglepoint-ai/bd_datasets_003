from django.db.models import Sum, Count, Q, F, Value, DecimalField
from django.db.models.functions import TruncDate, Coalesce
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

    # REVENUE & ORDERS STATS
    # Aggregate total revenue and counts
    agg_stats = Order.objects.aggregate(
        total_revenue=Coalesce(Sum('total'), Value(0, output_field=DecimalField())),
        revenue_30=Coalesce(Sum('total', filter=Q(created_at__date__gte=last_30_days)), Value(0, output_field=DecimalField())),
        revenue_7=Coalesce(Sum('total', filter=Q(created_at__date__gte=last_7_days)), Value(0, output_field=DecimalField())),
        total_orders=Count('id'),
        orders_30=Count('id', filter=Q(created_at__date__gte=last_30_days)),
        orders_7=Count('id', filter=Q(created_at__date__gte=last_7_days))
    )
    
    # Orders by Status
    status_stats = Order.objects.values('status').annotate(count=Count('id'))
    orders_by_status = {item['status']: item['count'] for item in status_stats}

    # Daily Revenue (Last 30 Days)
    # Truncate to date, group by date, sum total.
    daily_revenue_qs = Order.objects.filter(created_at__date__gte=last_30_days)\
        .annotate(date=TruncDate('created_at'))\
        .values('date')\
        .annotate(daily_total=Sum('total'))\
        .order_by('date')
    
    daily_revenue = {
        item['date'].isoformat(): float(item['daily_total']) 
        for item in daily_revenue_qs
    }

    # PRODUCT STATS
    # Total products and inventory check
    all_products = Product.objects.all().defer('metadata') # Defer metadata
    total_products = all_products.count()
    
    # Low stock and Out of stock
    # We can fetch specific fields to avoid loading full objects if logical
    # But list logic is simple enough with filters.
    out_of_stock_qs = all_products.filter(stock_quantity=0).values('id', 'name', 'sku')
    out_of_stock_products = list(out_of_stock_qs)

    low_stock_qs = all_products.filter(
        stock_quantity__gt=0, 
        stock_quantity__lte=F('low_stock_threshold')
    ).values('id', 'name', 'sku', 'stock_quantity', 'low_stock_threshold')
    
    low_stock_products = [
        {
            'id': p['id'], 'name': p['name'], 'sku': p['sku'], 
            'stock': p['stock_quantity'], 'threshold': p['low_stock_threshold']
        } for p in low_stock_qs
    ]

    # TOP PRODUCTS
    # Aggregating on OrderItem. Group by product_id (and name/sku to fetch them).
    # .values('product_id', 'product_name') makes the GROUP BY.
    top_products_qs = OrderItem.objects.values('product_id', 'product_name')\
        .annotate(
            revenue=Sum('total_price'),
            quantity=Sum('quantity')
        )\
        .order_by('-revenue')[:10]
        
    top_products = [
        {
            'id': tp['product_id'], 
            'name': tp['product_name'], 
            'quantity': tp['quantity'], 
            'revenue': float(tp['revenue'])
        } for tp in top_products_qs
    ]

    # CUSTOMERS STATS
    total_customers = User.objects.count()
    new_customers_30_days = User.objects.filter(date_joined__date__gte=last_30_days).count()

    # REVIEWS
    pending_reviews = Review.objects.filter(is_approved=False).count()

    return JsonResponse({
        'revenue': {
            'total': float(agg_stats['total_revenue']),
            'last_30_days': float(agg_stats['revenue_30']),
            'last_7_days': float(agg_stats['revenue_7']),
            'daily': daily_revenue,
        },
        'orders': {
            'total': agg_stats['total_orders'],
            'last_30_days': agg_stats['orders_30'],
            'last_7_days': agg_stats['orders_7'],
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
