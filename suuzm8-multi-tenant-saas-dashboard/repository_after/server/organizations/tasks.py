from __future__ import annotations

from celery import shared_task


@shared_task(bind=True, autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 3})
def send_invitation_email_task(self, invitation_id: int) -> None:
    # Import lazily so Celery can load without Django app registry issues.
    from organizations.models import Invitation

    invitation = Invitation.objects.select_related("organization").filter(id=invitation_id).first()
    if not invitation:
        return

    # If already accepted or expired, do nothing.
    if not invitation.is_valid():
        return

    invitation.send_invitation_email()
