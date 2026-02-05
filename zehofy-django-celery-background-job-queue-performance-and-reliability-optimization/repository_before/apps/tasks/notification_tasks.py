from celery import shared_task
from apps.notifications.models import Notification, PushSubscription
import requests
import json


@shared_task
def send_push_notification(user_id, title, message):
    subscriptions = PushSubscription.objects.filter(user_id=user_id)
    
    for sub in subscriptions:
        requests.post(
            sub.endpoint,
            json={
                'title': title,
                'body': message
            },
            headers={'Authorization': f'Bearer {sub.auth_key}'}
        )
    
    Notification.objects.create(
        user_id=user_id,
        title=title,
        message=message,
        status='sent'
    )


@shared_task
def send_bulk_notifications(user_ids, title, message):
    for user_id in user_ids:
        send_push_notification(user_id, title, message)


@shared_task
def process_notification_queue():
    pending = Notification.objects.filter(status='pending')
    
    for notification in pending:
        send_push_notification(
            notification.user_id,
            notification.title,
            notification.message
        )
        notification.status = 'sent'
        notification.save()


@shared_task
def cleanup_old_notifications():
    from datetime import datetime, timedelta
    
    cutoff = datetime.now() - timedelta(days=90)
    Notification.objects.filter(created_at__lt=cutoff).delete()
