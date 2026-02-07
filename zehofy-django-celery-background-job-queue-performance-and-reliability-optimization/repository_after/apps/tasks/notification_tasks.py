"""
Notification tasks with priority queue routing and rate limiting for external APIs.
"""
from celery import shared_task
from apps.notifications.models import Notification, PushSubscription
from .utils import (
    generate_idempotency_key,
    check_idempotency,
    mark_idempotency_complete,
    PUSH_NOTIFICATION_LIMITER,
    ProgressTracker
)
from celery.exceptions import Retry
import requests
import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Push API configuration
PUSH_API_URL = 'https://push.example.com/send'
API_KEY = 'secret-api-key'


@shared_task(
    bind=True,
    name='apps.tasks.notification_tasks.send_push_notification',
    queue='priority',
    priority=9,  # Highest priority for notifications
    max_retries=3,
    default_retry_delay=60,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=300,
    retry_jitter=True,
)
def send_push_notification(
    self,
    user_id: int,
    title: str,
    message: str,
    device_id: Optional[int] = None
) -> dict:
    """
    Send push notification to user with idempotency and rate limiting.
    
    Args:
        user_id: User ID to send notification to
        title: Notification title
        message: Notification message
        device_id: Optional specific device ID
        
    Returns:
        Dict with status and delivery info
    """
    # Generate idempotency key
    idempotency_key = generate_idempotency_key(
        'send_push_notification',
        (user_id, title, message),
        {'device_id': device_id}
    )
    
    # Check idempotency
    completed, cached_result = check_idempotency(idempotency_key)
    if completed and cached_result:
        logger.info(f"Push notification already sent to user {user_id}, skipping")
        return cached_result
    
    # Apply rate limiting
    allowed, wait_time = PUSH_NOTIFICATION_LIMITER.consume('push_api')
    if not allowed:
        return self.retry(exc=Exception(f"Rate limit exceeded, retry in {wait_time:.1f}s"), countdown=wait_time)
    
    try:
        # Get device subscriptions
        if device_id:
            subscriptions = PushSubscription.objects.filter(id=device_id, user_id=user_id)
        else:
            subscriptions = PushSubscription.objects.filter(user_id=user_id)
        
        if not subscriptions.exists():
            # Create pending notification even if no devices
            notification = Notification.objects.create(
                user_id=user_id,
                title=title,
                message=message,
                status='pending'
            )
            return {
                'status': 'no_devices',
                'user_id': user_id,
                'notification_id': notification.id
            }
        
        # Send to all user devices
        sent_count = 0
        failed_count = 0
        results = []
        
        for subscription in subscriptions:
            try:
                response = requests.post(
                    PUSH_API_URL,
                    json={
                        'token': subscription.endpoint,
                        'title': title,
                        'body': message
                    },
                    headers={
                        'Authorization': f'Bearer {API_KEY}',
                        'Content-Type': 'application/json'
                    },
                    timeout=10
                )
                
                if response.ok:
                    sent_count += 1
                    results.append({
                        'device_id': subscription.id,
                        'status': 'sent',
                        'response': response.json() if response.content else {}
                    })
                else:
                    failed_count += 1
                    results.append({
                        'device_id': subscription.id,
                        'status': 'failed',
                        'error': f"HTTP {response.status_code}"
                    })
                    
            except requests.RequestException as e:
                failed_count += 1
                results.append({
                    'device_id': subscription.id,
                    'status': 'error',
                    'error': str(e)
                })
        
        # Create notification record
        notification = Notification.objects.create(
            user_id=user_id,
            title=title,
            message=message,
            status='sent' if sent_count > 0 else 'failed',
            sent_at=timezone.now() if sent_count > 0 else None
        )
        
        result = {
            'status': 'sent' if sent_count > 0 else 'failed',
            'user_id': user_id,
            'notification_id': notification.id,
            'sent': sent_count,
            'failed': failed_count,
            'results': results
        }
        
        # Mark idempotency complete
        mark_idempotency_complete(idempotency_key, result, ttl=3600)  # 1 hour TTL for notifications
        
        return result
        
    except Exception as e:
        logger.error(f"Failed to send push notification to user {user_id}: {e}")
        raise


@shared_task(
    bind=True,
    name='apps.tasks.notification_tasks.send_batch_notifications',
    queue='priority',
    priority=8,
    max_retries=3,
    default_retry_delay=90,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
)
def send_batch_notifications(
    self,
    user_ids: list,
    title: str,
    message: str
) -> dict:
    """
    Send notifications to multiple users with rate limiting and progress tracking.
    
    Args:
        user_ids: List of user IDs
        title: Notification title
        message: Notification message
        
    Returns:
        Dict with total sent/failed counts
    """
    progress = ProgressTracker(self.request.id, total_steps=len(user_ids))
    progress.start()
    
    sent_total = 0
    failed_total = 0
    results = []
    
    for index, user_id in enumerate(user_ids):
        # Apply rate limiting
        allowed, wait_time = PUSH_NOTIFICATION_LIMITER.consume('batch_push')
        if not allowed:
            # Wait and retry this batch
            return self.retry(exc=Exception(f"Rate limit exceeded"), countdown=wait_time)
        
        # Generate idempotency key
        idempotency_key = generate_idempotency_key(
            'batch_notification',
            (user_id, title, message),
            {}
        )
        
        completed, _ = check_idempotency(idempotency_key)
        if completed:
            logger.debug(f"Notification already sent to user {user_id}, skipping")
            progress.increment()
            continue
        
        try:
            # Use the individual notification task
            result = send_push_notification(user_id, title, message)
            
            if result['status'] == 'sent':
                sent_total += 1
            else:
                failed_total += 1
            
            results.append({
                'user_id': user_id,
                'status': result['status']
            })
            
        except Exception as e:
            failed_total += 1
            results.append({
                'user_id': user_id,
                'status': 'error',
                'error': str(e)
            })
            logger.error(f"Failed to send batch notification to user {user_id}: {e}")
        
        # Update progress every 10 users
        if (index + 1) % 10 == 0:
            progress.increment(10, f"Processed {index + 1}/{len(user_ids)}")
    
    progress.complete({
        'sent': sent_total,
        'failed': failed_total,
        'total': len(user_ids)
    })
    
    return {
        'sent': sent_total,
        'failed': failed_total,
        'results': results
    }


@shared_task(
    bind=True,
    name='apps.tasks.notification_tasks.process_notification_queue',
    queue='priority',
    priority=7,
    max_retries=2,
    default_retry_delay=30,
)
def process_notification_queue(self, batch_size: int = 50) -> dict:
    """
    Process pending notifications from the queue with rate limiting.
    
    Args:
        batch_size: Number of notifications to process
        
    Returns:
        Dict with processed count
    """
    progress = ProgressTracker(self.request.id, total_steps=batch_size)
    progress.start()
    
    pending = Notification.objects.filter(status='pending')[:batch_size]
    
    processed = 0
    sent = 0
    failed = 0
    
    for notification in pending:
        # Apply rate limiting
        allowed, wait_time = PUSH_NOTIFICATION_LIMITER.consume('queue_processor')
        if not allowed:
            # Pause processing
            logger.info("Rate limit reached, pausing queue processing")
            break
        
        try:
            result = send_push_notification(
                notification.user_id,
                notification.title,
                notification.message
            )
            
            if result['status'] == 'sent':
                notification.status = 'sent'
                sent += 1
            else:
                notification.status = 'failed'
                failed += 1
            
            notification.sent_at = timezone.now()
            notification.save()
            processed += 1
            
        except Exception as e:
            notification.status = 'failed'
            notification.error_message = str(e)
            notification.save()
            failed += 1
            logger.error(f"Failed to process notification {notification.id}: {e}")
        
        progress.increment()
    
    progress.complete({'processed': processed, 'sent': sent, 'failed': failed})
    
    return {'processed': processed, 'sent': sent, 'failed': failed}


@shared_task(
    bind=True,
    name='apps.tasks.notification_tasks.cleanup_old_notifications',
    queue='bulk',
    priority=1,
)
def cleanup_old_notifications(days: int = 90) -> dict:
    """
    Clean up old notifications from the database.
    
    Args:
        days: Delete notifications older than this many days
        
    Returns:
        Dict with deleted count
    """
    from datetime import timedelta
    from django.utils import timezone
    
    cutoff = timezone.now() - timedelta(days=days)
    
    deleted_count, _ = Notification.objects.filter(
        created_at__lt=cutoff,
        status__in=['sent', 'failed']
    ).delete()
    
    return {'deleted': deleted_count}


# Import timezone
from django.utils import timezone
