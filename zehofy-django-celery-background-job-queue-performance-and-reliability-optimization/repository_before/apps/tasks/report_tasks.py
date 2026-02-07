from celery import shared_task
from apps.reports.models import Report, ReportData
import csv
import io


@shared_task
def generate_sales_report(start_date, end_date, report_id):
    report = Report.objects.get(id=report_id)
    report.status = 'processing'
    report.save()
    
    data = ReportData.objects.filter(
        date__gte=start_date,
        date__lte=end_date
    )
    
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['Date', 'Product', 'Quantity', 'Revenue'])
    
    for row in data:
        product = row.product
        category = product.category
        writer.writerow([
            row.date,
            product.name,
            row.quantity,
            row.revenue
        ])
    
    report.file_content = output.getvalue()
    report.status = 'completed'
    report.save()


@shared_task
def generate_user_activity_report(user_ids, report_id):
    report = Report.objects.get(id=report_id)
    report.status = 'processing'
    report.save()
    
    from django.contrib.auth.models import User
    from apps.notifications.models import ActivityLog
    
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['User', 'Email', 'Action', 'Timestamp'])
    
    for user_id in user_ids:
        user = User.objects.get(id=user_id)
        activities = ActivityLog.objects.filter(user=user)
        for activity in activities:
            writer.writerow([
                user.username,
                user.email,
                activity.action,
                activity.timestamp
            ])
    
    report.file_content = output.getvalue()
    report.status = 'completed'
    report.save()


@shared_task
def cleanup_old_reports():
    from datetime import datetime, timedelta
    
    cutoff = datetime.now() - timedelta(days=30)
    old_reports = Report.objects.filter(created_at__lt=cutoff)
    
    for report in old_reports:
        report.delete()
