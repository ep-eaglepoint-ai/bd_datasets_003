from django.urls import path
from .views import PurchaseAPIView

urlpatterns = [
    path("purchase/", PurchaseAPIView.as_view(), name="purchase"),
]