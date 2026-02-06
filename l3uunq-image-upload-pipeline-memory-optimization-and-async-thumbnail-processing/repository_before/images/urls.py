from django.urls import path
from .views import ImageUploadView, ImageListView, ImageDeleteView

urlpatterns = [
    path('images/', ImageListView.as_view(), name='image-list'),
    path('images/upload/', ImageUploadView.as_view(), name='image-upload'),
    path('images/<int:pk>/', ImageDeleteView.as_view(), name='image-delete'),
]
