from django.urls import path
from inventory.views import PurchaseAPIView # Ensure this import is correct

urlpatterns = [
    path('api/purchase/', PurchaseAPIView.as_view()),
]