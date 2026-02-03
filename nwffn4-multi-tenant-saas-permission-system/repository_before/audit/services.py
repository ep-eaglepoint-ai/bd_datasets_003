from audit.models import AuditLog


class AuditService:

    def log(self, user, action, resource_type, resource_id, result, details=None):
        AuditLog.objects.create(
            user=user,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            result=result,
            details=details or {}
        )


audit_service = AuditService()
