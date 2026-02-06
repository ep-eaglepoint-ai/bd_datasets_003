from django.db import models
from django.contrib.auth.models import User


class Image(models.Model):
    title = models.CharField(max_length=255)
    original_file = models.CharField(max_length=500)
    file_size = models.IntegerField(default=0)
    width = models.IntegerField(default=0)
    height = models.IntegerField(default=0)
    mime_type = models.CharField(max_length=50)
    uploaded_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='images')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.title


class Thumbnail(models.Model):
    image = models.ForeignKey(Image, on_delete=models.CASCADE, related_name='thumbnails')
    size_name = models.CharField(max_length=20)
    file_path = models.CharField(max_length=500)
    width = models.IntegerField()
    height = models.IntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.image.title} - {self.size_name}"
