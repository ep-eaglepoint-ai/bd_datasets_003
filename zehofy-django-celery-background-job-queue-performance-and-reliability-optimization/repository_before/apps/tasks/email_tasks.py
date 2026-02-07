from celery import shared_task
from django.core.mail import send_mail
from apps.notifications.models import EmailLog
import time


@shared_task
def send_bulk_emails(user_ids, subject, body):
    from django.contrib.auth.models import User
    
    for user_id in user_ids:
        user = User.objects.get(id=user_id)
        send_mail(
            subject,
            body,
            'noreply@example.com',
            [user.email],
            fail_silently=False,
        )
        EmailLog.objects.create(
            user=user,
            subject=subject,
            status='sent'
        )
        time.sleep(0.1)


@shared_task
def send_welcome_email(user_id):
    from django.contrib.auth.models import User
    
    user = User.objects.get(id=user_id)
    send_mail(
        'Welcome!',
        f'Hello {user.first_name}, welcome to our platform!',
        'noreply@example.com',
        [user.email],
        fail_silently=False,
    )
    EmailLog.objects.create(
        user=user,
        subject='Welcome!',
        status='sent'
    )


@shared_task
def send_password_reset_email(user_id, reset_token):
    from django.contrib.auth.models import User
    
    user = User.objects.get(id=user_id)
    send_mail(
        'Password Reset',
        f'Your reset token is: {reset_token}',
        'noreply@example.com',
        [user.email],
        fail_silently=False,
    )
