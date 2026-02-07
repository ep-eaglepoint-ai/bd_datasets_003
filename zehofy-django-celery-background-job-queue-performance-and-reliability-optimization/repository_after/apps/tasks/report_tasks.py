"""
Report generation tasks with database aggregations and progress tracking.
"""
from celery import shared_task
from apps.reports.models import Report, ReportData, Product
from .utils import ProgressTracker
from django.db.models import Sum, Count, Avg, F, ExpressionWrapper, FloatField
from django.db.models.functions import TruncDate
from django.utils import timezone
import csv
import io
import json
import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    name='apps.tasks.report_tasks.generate_sales_report',
    queue='default',
    priority=5,
    max_retries=3,
    default_retry_delay=60,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=300,
)
def generate_sales_report(self, start_date: str, end_date: str) -> dict:
    """
    Generate sales report using database aggregations (no N+1 queries).
    
    Args:
        start_date: Start date (YYYY-MM-DD)
        end_date: End date (YYYY-MM-DD)
        
    Returns:
        Dict with report data
    """
    progress = ProgressTracker(self.request.id, total_steps=100)
    progress.start()
    
    # Use database aggregations instead of Python loops
    # This eliminates N+1 query patterns
    report_data = ReportData.objects.filter(
        date__gte=start_date,
        date__lte=end_date
    ).aggregate(
        total_orders=Count('id'),
        total_revenue=Sum('revenue'),
        total_quantity=Sum('quantity')
    )
    
    progress.update(30, "Aggregated totals")
    
    # Get orders by status using aggregation
    orders_by_status = {}
    status_aggregates = ReportData.objects.filter(
        date__gte=start_date,
        date__lte=end_date
    ).values('product__category__name').annotate(
        order_count=Count('id'),
        total_revenue=Sum('revenue')
    )
    
    for item in status_aggregates:
        category = item['product__category__name'] or 'Uncategorized'
        orders_by_status[category] = {
            'count': item['order_count'],
            'revenue': float(item['total_revenue'] or 0)
        }
    
    progress.update(60, "Aggregated by category")
    
    # Daily breakdown using database aggregation
    daily_breakdown = ReportData.objects.filter(
        date__gte=start_date,
        date__lte=end_date
    ).annotate(
        day=TruncDate('date')
    ).values('day').annotate(
        order_count=Count('id'),
        total_revenue=Sum('revenue'),
        total_quantity=Sum('quantity')
    ).order_by('day')
    
    daily_data = [
        {
            'date': str(item['day']),
            'orders': item['order_count'],
            'revenue': float(item['total_revenue'] or 0),
            'quantity': item['total_quantity']
        }
        for item in daily_breakdown
    ]
    
    progress.update(80, "Generated daily breakdown")
    
    # Build final report
    report = {
        'total_orders': report_data['total_orders'] or 0,
        'total_revenue': float(report_data['total_revenue'] or 0),
        'total_quantity': report_data['total_quantity'] or 0,
        'orders_by_category': orders_by_status,
        'daily_breakdown': daily_data,
        'start_date': start_date,
        'end_date': end_date,
        'generated_at': timezone.now().isoformat()
    }
    
    progress.update(90, "Saving report")
    
    # Create report record (without file_content to save memory)
    Report.objects.create(
        name=f"Sales Report {start_date} to {end_date}",
        report_type='sales',
        status='completed',
        created_by_id=1  # Default user
    )
    
    progress.complete(report)
    
    return report


@shared_task(
    bind=True,
    name='apps.tasks.report_tasks.generate_inventory_report',
    queue='default',
    priority=5,
    max_retries=2,
    default_retry_delay=60,
)
def generate_inventory_report(self) -> dict:
    """
    Generate inventory report using database aggregations.
    Uses bulk queries to avoid N+1 patterns.
    
    Returns:
        Dict with inventory data
    """
    progress = ProgressTracker(self.request.id, total_steps=100)
    progress.start()
    
    # Get all products with aggregated inventory movements
    # Single query with JOIN instead of N+1
    products = Product.objects.prefetch_related(
        'inventorymovement_set'
    ).all()
    
    progress.update(20, "Fetched products")
    
    # Use aggregation for efficiency
    inventory_data = ReportData.objects.values('product_id').annotate(
        total_in=Sum(
            ExpressionWrapper(
                F('quantity'),
                output_field=FloatField()
            ),
            filter=models.Q(inventorymovement__movement_type='in')
        ),
        total_out=Sum(
            ExpressionWrapper(
                F('quantity'),
                output_field=FloatField()
            ),
            filter=models.Q(inventorymovement__movement_type='out')
        )
    )
    
    progress.update(50, "Aggregated inventory movements")
    
    # Build report using single pass
    report = []
    for product in products:
        # Calculate totals using prefetched data
        movements = product.inventorymovement_set.all()
        total_in = sum(m.quantity for m in movements if m.movement_type == 'in')
        total_out = sum(m.quantity for m in movements if m.movement_type == 'out')
        
        report.append({
            'product_id': product.id,
            'name': product.name,
            'current_stock': product.stock,
            'total_in': total_in,
            'total_out': total_out
        })
    
    progress.update(80, "Built inventory report")
    
    result = {
        'generated_at': timezone.now().isoformat(),
        'products_count': len(report),
        'inventory': report
    }
    
    progress.complete(result)
    
    return result


@shared_task(
    bind=True,
    name='apps.tasks.report_tasks.generate_user_activity_report',
    queue='default',
    priority=5,
    max_retries=3,
    default_retry_delay=60,
)
def generate_user_activity_report(self, user_ids: list) -> dict:
    """
    Generate user activity report with database aggregations.
    
    Args:
        user_ids: List of user IDs to include
        
    Returns:
        Dict with activity data
    """
    from django.contrib.auth.models import User
    from apps.notifications.models import ActivityLog
    
    progress = ProgressTracker(self.request.id, total_steps=len(user_ids))
    progress.start()
    
    # Fetch users in bulk
    users = User.objects.filter(id__in=user_ids)
    
    progress.update(10, f"Fetched {len(users)} users")
    
    # Use aggregation for activity counts
    activity_counts = ActivityLog.objects.filter(
        user_id__in=user_ids
    ).values('user_id').annotate(
        action_count=Count('id')
    )
    
    activity_map = {item['user_id']: item['action_count'] for item in activity_counts}
    
    progress.update(40, "Aggregated activity data")
    
    # Build report
    report_data = []
    for index, user in enumerate(users):
        report_data.append({
            'user_id': user.id,
            'username': user.username,
            'email': user.email,
            'activity_count': activity_map.get(user.id, 0)
        })
        
        if (index + 1) % 10 == 0:
            progress.update(index + 1, f"Processed {index + 1}/{len(users)} users")
    
    result = {
        'generated_at': timezone.now().isoformat(),
        'users_count': len(report_data),
        'activities': report_data
    }
    
    progress.complete(result)
    
    return result


@shared_task(
    bind=True,
    name='apps.tasks.report_tasks.generate_csv_report',
    queue='default',
    priority=5,
    max_retries=2,
    default_retry_delay=60,
)
def generate_csv_report(
    self,
    report_type: str,
    start_date: str = None,
    end_date: str = None
) -> dict:
    """
    Generate CSV report using StringIO (memory efficient).
    
    Args:
        report_type: Type of report to generate
        start_date: Optional start date
        end_date: Optional end date
        
    Returns:
        Dict with CSV content
    """
    progress = ProgressTracker(self.request.id, total_steps=100)
    progress.start()
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    if report_type == 'sales':
        writer.writerow(['Date', 'Product', 'Category', 'Quantity', 'Revenue'])
        
        # Stream results using iterator
        queryset = ReportData.objects.all()
        if start_date and end_date:
            queryset = queryset.filter(
                date__gte=start_date,
                date__lte=end_date
            )
        
        queryset = queryset.select_related('product__category')
        
        for item in queryset.iterator(chunk_size=500):
            writer.writerow([
                item.date,
                item.product.name,
                item.product.category.name if item.product.category else 'N/A',
                item.quantity,
                item.revenue
            ])
            
            progress.increment(message=f"Writing row for {item.product.name}")
    
    elif report_type == 'inventory':
        writer.writerow(['Product', 'SKU', 'Stock', 'Price', 'Category'])
        
        queryset = Product.objects.select_related('category')
        
        for product in queryset.iterator(chunk_size=500):
            writer.writerow([
                product.name,
                product.sku,
                product.stock,
                product.price,
                product.category.name if product.category else 'N/A'
            ])
    
    csv_content = output.getvalue()
    
    result = {
        'report_type': report_type,
        'content_length': len(csv_content),
        'generated_at': timezone.now().isoformat()
    }
    
    progress.complete(result)
    
    return result


@shared_task(
    bind=True,
    name='apps.tasks.report_tasks.cleanup_old_reports',
    queue='bulk',
    priority=1,
)
def cleanup_old_reports(days: int = 30) -> dict:
    """
    Clean up old reports from the database.
    
    Args:
        days: Delete reports older than this many days
        
    Returns:
        Dict with deleted count
    """
    from datetime import timedelta
    
    cutoff = timezone.now() - timedelta(days=days)
    
    deleted_count, _ = Report.objects.filter(
        created_at__lt=cutoff,
        status='completed'
    ).delete()
    
    return {'deleted': deleted_count}


# Import models for aggregations
from django.db import models
