from rest_framework import serializers
from .models import Image, Thumbnail


class ThumbnailSerializer(serializers.ModelSerializer):
    class Meta:
        model = Thumbnail
        fields = ['id', 'size_name', 'file_path', 'width', 'height']


class ImageSerializer(serializers.ModelSerializer):
    thumbnails = ThumbnailSerializer(many=True, read_only=True)
    uploaded_by = serializers.SerializerMethodField()

    class Meta:
        model = Image
        fields = ['id', 'title', 'original_file', 'file_size', 'width', 'height',
                  'mime_type', 'uploaded_by', 'thumbnails', 'created_at']

    def get_uploaded_by(self, obj):
        return {
            'id': obj.uploaded_by.id,
            'username': obj.uploaded_by.username,
        }
