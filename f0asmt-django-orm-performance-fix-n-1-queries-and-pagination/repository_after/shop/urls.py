from django.urls import path
from shop.views import products, orders, admin_dashboard

urlpatterns = [
    path('products/', products.product_list, name='product_list'),
    path('products/<slug:slug>/', products.product_detail, name='product_detail'),
    path('orders/', orders.order_list, name='order_list'),
    path('orders/<str:order_number>/', orders.order_detail, name='order_detail'),
    path('admin/dashboard/', admin_dashboard.dashboard_stats, name='dashboard_stats'),
]
