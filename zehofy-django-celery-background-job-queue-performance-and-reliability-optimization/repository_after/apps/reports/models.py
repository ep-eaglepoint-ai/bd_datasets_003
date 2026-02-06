"""
Report models with optimized indexes for performance.
"""
from django.db import models
from django.contrib.auth.models import User


class Category(models.Model):
    """Product category model."""
    
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        verbose_name_plural = 'categories'
    
    def __str__(self):
        return self.name


class Product(models.Model):
    """Product model with inventory tracking."""
    
    name = models.CharField(max_length=255)
    sku = models.CharField(max_length=100, unique=True, db_index=True)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    stock = models.IntegerField(default=0)
    category = models.ForeignKey(
        Category,
        on_delete=models.CASCADE,
        related_name='products',
        null=True,
        blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        indexes = [
            models.Index(fields=['category', 'created_at']),
            models.Index(fields=['sku', 'stock']),
        ]
    
    def __str__(self):
        return self.name


class InventoryMovement(models.Model):
    """Inventory movement tracking model."""
    
    MOVEMENT_TYPES = [
        ('in', 'Stock In'),
        ('out', 'Stock Out'),
        ('adjustment', 'Adjustment'),
    ]
    
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name='inventorymovement_set'
    )
    movement_type = models.CharField(max_length=20, choices=MOVEMENT_TYPES)
    quantity = models.IntegerField()
    reason = models.CharField(max_length=255, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)
    
    class Meta:
        indexes = [
            models.Index(fields=['product', 'movement_type']),
            models.Index(fields=['timestamp', 'movement_type']),
        ]
    
    def __str__(self):
        return f"{self.product.name} - {self.movement_type} - {self.quantity}"


class Report(models.Model):
    """Report generation tracking model."""
    
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('processing', 'Processing'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
    ]
    
    REPORT_TYPES = [
        ('sales', 'Sales Report'),
        ('inventory', 'Inventory Report'),
        ('user_activity', 'User Activity Report'),
        ('custom', 'Custom Report'),
    ]
    
    name = models.CharField(max_length=255)
    report_type = models.CharField(max_length=50, choices=REPORT_TYPES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    parameters = models.JSONField(default=dict)
    file_content = models.TextField(blank=True)
    created_by = models.ForeignKey(User, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    error_message = models.TextField(blank=True)
    
    class Meta:
        indexes = [
            models.Index(fields=['status', 'created_at']),
            models.Index(fields=['report_type', 'status']),
        ]
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.name} ({self.status})"


class ReportData(models.Model):
    """Report data model for sales and analytics."""
    
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name='reportdata_set'
    )
    date = models.DateField(db_index=True)
    quantity = models.IntegerField()
    revenue = models.DecimalField(max_digits=12, decimal_places=2)
    
    class Meta:
        verbose_name_plural = 'report data'
        indexes = [
            models.Index(fields=['date', 'product']),
        ]
    
    def __str__(self):
        return f"{self.product.name} - {self.date}"


class ImportJob(models.Model):
    """Import job tracking model."""
    
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('processing', 'Processing'),
        ('completed', 'Completed'),
        ('completed_with_errors', 'Completed with Errors'),
        ('failed', 'Failed'),
    ]
    
    IMPORT_TYPES = [
        ('products_csv', 'Products CSV'),
        ('products_json', 'Products JSON'),
        ('users', 'Users Import'),
        ('custom', 'Custom Import'),
    ]
    
    name = models.CharField(max_length=255)
    job_type = models.CharField(max_length=50, choices=IMPORT_TYPES)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='pending')
    file_path = models.CharField(max_length=500)
    records_processed = models.IntegerField(default=0)
    records_failed = models.IntegerField(default=0)
    created_by = models.ForeignKey(User, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    error_message = models.TextField(blank=True)
    
    class Meta:
        indexes = [
            models.Index(fields=['status', 'created_at']),
            models.Index(fields=['job_type', 'status']),
        ]
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.name} ({self.status})"
