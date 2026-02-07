from django.db import models
from django.conf import settings


class AuditLog(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    resource_type = models.CharField(max_length=50)
    resource_id = models.IntegerField()
    permission = models.CharField(max_length=50)
    granted = models.BooleanField()
    cached = models.BooleanField(default=False)
    timestamp = models.DateTimeField(db_index=True)

    class Meta:
        indexes = [
            models.Index(fields=['user', 'timestamp']),
            models.Index(fields=['resource_type', 'resource_id', 'timestamp']),
            models.Index(fields=['timestamp']),
            models.Index(fields=['granted', 'timestamp']),
        ]
        ordering = ['-timestamp']

    def __str__(self):
        return f"{self.user} - {self.permission} - {self.resource_type}:{self.resource_id}"
