import os
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from .models import Image
from .serializers import ImageSerializer
from .services import process_image

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'media', 'uploads')
ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp']


class ImageUploadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        uploaded_file = request.FILES.get('image')
        if not uploaded_file:
            return Response({'error': 'No image provided'}, status=status.HTTP_400_BAD_REQUEST)

        ext = os.path.splitext(uploaded_file.name)[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            return Response({'error': 'Invalid file type'}, status=status.HTTP_400_BAD_REQUEST)

        file_data = uploaded_file.read()

        file_path = os.path.join(UPLOAD_DIR, uploaded_file.name)
        os.makedirs(os.path.dirname(file_path), exist_ok=True)

        with open(file_path, 'wb') as f:
            f.write(file_data)

        image_record = Image.objects.create(
            title=request.data.get('title', uploaded_file.name),
            original_file=file_path,
            file_size=len(file_data),
            mime_type=uploaded_file.content_type,
            uploaded_by=request.user,
        )

        process_image(image_record, file_data)

        serializer = ImageSerializer(image_record)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ImageListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        images = Image.objects.all()
        serializer = ImageSerializer(images, many=True)
        return Response(serializer.data)


class ImageDeleteView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        try:
            image = Image.objects.get(pk=pk)
        except Image.DoesNotExist:
            return Response({'error': 'Image not found'}, status=status.HTTP_404_NOT_FOUND)

        if image.uploaded_by != request.user:
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

        if os.path.exists(image.original_file):
            os.remove(image.original_file)

        for thumb in image.thumbnails.all():
            if os.path.exists(thumb.file_path):
                os.remove(thumb.file_path)

        image.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
