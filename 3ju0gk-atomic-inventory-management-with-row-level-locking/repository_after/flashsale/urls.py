from django.urls import path
from inventory.views import PurchaseAPIView, product_list

urlpatterns = [
    # Ensure this slash matches your axios call
    path('api/products/', product_list, name='product-list'), 
    path('api/purchase/', PurchaseAPIView.as_view(), name='purchase'),
]