from django.db import models
from django.utils import timezone


class LoginAttempt(models.Model):
    username = models.CharField(max_length=150)
    ip_address = models.GenericIPAddressField()
    timestamp = models.DateTimeField(default=timezone.now)
    success = models.BooleanField(default=False)

    class Meta:
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['ip_address']),
            models.Index(fields=['timestamp']),
            models.Index(fields=['ip_address', 'timestamp']),
            models.Index(fields=['success']),
        ]

    def __str__(self):
        return f"{self.username} from {self.ip_address} at {self.timestamp} - {'Success' if self.success else 'Failed'}"
