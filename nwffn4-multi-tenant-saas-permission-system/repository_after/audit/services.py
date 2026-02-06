from audit.models import AuditLog
from django.utils import timezone
import logging

logger = logging.getLogger(__name__)


class AuditService:

    def log_permission_check(self, user, resource_type, resource_id, permission, result, cached=False):
        try:
            AuditLog.objects.create(
                user=user,
                resource_type=resource_type,
                resource_id=resource_id,
                permission=permission,
                granted=result,
                cached=cached,
                timestamp=timezone.now()
            )
        except Exception as e:
            # Silently fail to avoid breaking permission checks
            logger.error(f"Failed to log permission check: {e}")

    def bulk_log_permission_checks(self, entries):
        try:
            audit_logs = [
                AuditLog(
                    user=entry['user'],
                    resource_type=entry['resource_type'],
                    resource_id=entry['resource_id'],
                    permission=entry['permission'],
                    granted=entry['result'],
                    cached=entry.get('cached', False),
                    timestamp=timezone.now()
                )
                for entry in entries
            ]
            AuditLog.objects.bulk_create(audit_logs)
        except Exception as e:
            # Silently fail to avoid breaking bulk permission checks
            logger.error(f"Failed to bulk log permission checks: {e}")


audit_service = AuditService()
