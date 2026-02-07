from django.contrib import admin
from .models import Product, Wallet


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ('name', 'price', 'stock', 'active', 'created_at')
    list_filter = ('active',)
    search_fields = ('name',)


@admin.register(Wallet)
class WalletAdmin(admin.ModelAdmin):
    list_display = ('user_id', 'balance', 'updated_at')
    search_fields = ('user_id',)