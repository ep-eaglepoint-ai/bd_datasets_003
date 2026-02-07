"""
Email tasks with priority queue routing, idempotency, and rate limiting.
"""
from celery import shared_task
from django.core.mail import send_mail, EmailMultiAlternatives
from django.conf import settings
from apps.notifications.models import EmailLog
from .utils import (
    generate_idempotency_key,
    check_idempotency,
    mark_idempotency_complete,
    EMAIL_RATE_LIMITER,
    ProgressTracker
)
from celery.exceptions import Retry
import logging

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    name='apps.tasks.email_tasks.send_welcome_email',
    queue='priority',
    priority=8,
    max_retries=3,
    default_retry_delay=60,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=900,
    retry_jitter=True,
)
def send_welcome_email(self, user_id: int) -> dict:
    """
    Send welcome email to user with idempotency and rate limiting.
    
    Args:
        user_id: User ID to send welcome email to
        
    Returns:
        Dict with status and user_id
    """
    from django.contrib.auth.models import User
    
    # Generate idempotency key
    idempotency_key = generate_idempotency_key(
        'send_welcome_email',
        (user_id,),
        {}
    )
    
    # Check if already completed
    completed, cached_result = check_idempotency(idempotency_key)
    if completed and cached_result:
        logger.info(f"Welcome email already sent for user {user_id}, skipping")
        return cached_result
    
    try:
        # Apply rate limiting
        allowed, wait_time = EMAIL_RATE_LIMITER.consume('email')
        if not allowed:
            # Retry after wait time
            return self.retry(exc=Exception(f"Rate limit exceeded, retry in {wait_time}s"), countdown=wait_time)
        
        # Get user
        user = User.objects.get(id=user_id)
        
        # Send email
        send_mail(
            subject='Welcome!',
            message=f'Hello {user.get_full_name() or user.username}, welcome to our platform!',
            from_email='noreply@example.com',
            recipient_list=[user.email],
            fail_silently=False,
        )
        
        # Log email
        EmailLog.objects.create(
            user=user,
            subject='Welcome!',
            status='sent'
        )
        
        result = {'status': 'sent', 'user_id': user_id}
        
        # Mark as completed
        mark_idempotency_complete(idempotency_key, result)
        
        return result
        
    except Exception as e:
        logger.error(f"Failed to send welcome email to user {user_id}: {e}")
        raise


@shared_task(
    bind=True,
    name='apps.tasks.email_tasks.send_bulk_emails',
    queue='priority',
    priority=8,
    max_retries=3,
    default_retry_delay=120,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=900,
    retry_jitter=True,
)
def send_bulk_emails(self, user_ids: list, subject: str, body: str) -> dict:
    """
    Send bulk emails to multiple users with rate limiting and progress tracking.
    
    Args:
        user_ids: List of user IDs
        subject: Email subject
        body: Email body
        
    Returns:
        Dict with sent and failed counts
    """
    from django.contrib.auth.models import User
    
    # Track progress
    progress = ProgressTracker(self.request.id, total_steps=len(user_ids))
    progress.start()
    
    sent = []
    failed = []
    
    for index, user_id in enumerate(user_ids):
        # Check idempotency for each email
        idempotency_key = generate_idempotency_key(
            'send_bulk_email',
            (user_id, subject),
            {}
        )
        
        completed, _ = check_idempotency(idempotency_key)
        if completed:
            logger.debug(f"Email already sent to user {user_id}, skipping")
            sent.append({'user_id': user_id, 'status': 'skipped'})
            progress.increment(message=f"Skipped user {user_id}")
            continue
        
        try:
            # Apply rate limiting
            allowed, wait_time = EMAIL_RATE_LIMITER.consume('bulk_email')
            if not allowed:
                # Re-raise for retry
                return self.retry(exc=Exception(f"Rate limit exceeded"), countdown=wait_time)
            
            user = User.objects.get(id=user_id)
            
            send_mail(
                subject=subject,
                message=body,
                from_email='noreply@example.com',
                recipient_list=[user.email],
                fail_silently=True,
            )
            
            EmailLog.objects.create(
                user=user,
                subject=subject,
                status='sent'
            )
            
            result = {'user_id': user_id, 'status': 'sent'}
            sent.append(result)
            mark_idempotency_complete(idempotency_key, result)
            
        except Exception as e:
            logger.error(f"Failed to send email to user {user_id}: {e}")
            failed.append({'user_id': user_id, 'status': 'failed', 'error': str(e)})
        
        # Update progress every 10 emails or at the end
        if (index + 1) % 10 == 0:
            progress.increment(10, f"Processed {index + 1}/{len(user_ids)}")
    
    progress.complete({'sent': len(sent), 'failed': len(failed)})
    
    return {'sent': sent, 'failed': failed, 'total': len(user_ids)}


@shared_task(
    bind=True,
    name='apps.tasks.email_tasks.send_password_reset_email',
    queue='priority',
    priority=9,  # Higher priority for security tasks
    max_retries=3,
    default_retry_delay=60,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=300,
    retry_jitter=True,
)
def send_password_reset_email(self, user_id: int, reset_token: str) -> dict:
    """
    Send password reset email with idempotency.
    
    Args:
        user_id: User ID
        reset_token: Password reset token
        
    Returns:
        Dict with status
    """
    from django.contrib.auth.models import User
    
    # Idempotency key includes token (same token = same email)
    idempotency_key = generate_idempotency_key(
        'send_password_reset_email',
        (user_id,),
        {'reset_token': reset_token[:8]}  # Only use first 8 chars for privacy
    )
    
    completed, cached_result = check_idempotency(idempotency_key)
    if completed and cached_result:
        return cached_result
    
    try:
        allowed, wait_time = EMAIL_RATE_LIMITER.consume('password_reset')
        if not allowed:
            return self.retry(exc=Exception(f"Rate limit exceeded"), countdown=wait_time)
        
        user = User.objects.get(id=user_id)
        
        send_mail(
            subject='Password Reset',
            message=f'Your password reset token is: {reset_token}',
            from_email='noreply@example.com',
            recipient_list=[user.email],
            fail_silently=False,
        )
        
        EmailLog.objects.create(
            user=user,
            subject='Password Reset',
            status='sent'
        )
        
        result = {'status': 'sent', 'user_id': user_id}
        mark_idempotency_complete(idempotency_key, result)
        
        return result
        
    except Exception as e:
        logger.error(f"Failed to send password reset to user {user_id}: {e}")
        raise
