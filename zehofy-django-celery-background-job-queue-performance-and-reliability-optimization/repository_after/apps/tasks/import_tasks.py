"""
Import tasks with streaming file processing, bulk database operations, and progress tracking.
"""
from celery import shared_task
from apps.reports.models import ImportJob, Product, Category
from .utils import ProgressTracker
from django.db import transaction
from django.db.models import Prefetch
import csv
import json
import logging
from typing import Iterator, Dict, Any

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    name='apps.tasks.import_tasks.import_products_from_csv',
    queue='bulk',  # Use bulk queue
    priority=3,  # Lower priority than emails
    max_retries=3,
    default_retry_delay=120,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
)
def import_products_from_csv(self, file_path: str, job_id: int = None) -> dict:
    """
    Import products from CSV file using streaming and bulk operations.
    Memory-bounded: processes file in chunks without loading entire file.
    
    Args:
        file_path: Path to CSV file
        job_id: Optional ImportJob ID for progress tracking
        
    Returns:
        Dict with imported count and status
    """
    try:
        # Get or create import job
        if job_id:
            job = ImportJob.objects.get(id=job_id)
            job.status = 'processing'
            job.save()
        else:
            job = None
        
        # Track progress
        progress = ProgressTracker(
            self.request.id,
            total_steps=100  # Will update after counting
        )
        
        # Count total lines for progress calculation
        total_lines = 0
        with open(file_path, 'r', encoding='utf-8') as f:
            total_lines = sum(1 for _ in f)
        
        progress = ProgressTracker(self.request.id, total_steps=total_lines or 1)
        progress.start()
        
        imported = 0
        failed = 0
        errors = []
        
        # Process in streaming chunks - MEMORY BOUNDED
        batch_size = 100
        batch = []
        current_line = 0
        
        with open(file_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            
            for row in reader:
                current_line += 1
                
                try:
                    # Parse row
                    product_data = {
                        'sku': row['sku'],
                        'name': row['name'],
                        'price': float(row['price']),
                        'stock': int(row.get('stock', 0)),
                        'category_id': int(row.get('category_id', 1))
                    }
                    batch.append(product_data)
                    
                except (ValueError, KeyError) as e:
                    failed += 1
                    errors.append({
                        'line': current_line,
                        'error': str(e),
                        'data': row
                    })
                    progress.increment(message=f"Failed at line {current_line}")
                    continue
                
                # Bulk create when batch is full
                if len(batch) >= batch_size:
                    try:
                        with transaction.atomic():
                            # Get or create category for each product
                            products_to_create = []
                            for data in batch:
                                category, _ = Category.objects.get_or_create(
                                    id=data['category_id'],
                                    defaults={'name': f'Category {data["category_id"]}'}
                                )
                                products_to_create.append(
                                    Product(
                                        sku=data['sku'],
                                        name=data['name'],
                                        price=data['price'],
                                        stock=data['stock'],
                                        category=category
                                    )
                                )
                            
                            # Use bulk_create with ignore_conflicts for idempotency
                            created = Product.objects.bulk_create(
                                products_to_create,
                                ignore_conflicts=True,
                                batch_size=500
                            )
                            imported += len(created)
                        
                    except Exception as e:
                        failed += len(batch)
                        errors.append({'batch_start': current_line - len(batch), 'error': str(e)})
                    
                    batch = []
                    
                    # Update progress
                    progress.increment(
                        batch_size,
                        f"Processed {current_line}/{total_lines} lines"
                    )
        
        # Process remaining items in batch
        if batch:
            try:
                with transaction.atomic():
                    products_to_create = []
                    for data in batch:
                        category, _ = Category.objects.get_or_create(
                            id=data['category_id'],
                            defaults={'name': f'Category {data["category_id"]}'}
                        )
                        products_to_create.append(
                            Product(
                                sku=data['sku'],
                                name=data['name'],
                                price=data['price'],
                                stock=data['stock'],
                                category=category
                            )
                        )
                    
                    created = Product.objects.bulk_create(
                        products_to_create,
                        ignore_conflicts=True,
                        batch_size=500
                    )
                    imported += len(created)
            except Exception as e:
                failed += len(batch)
                errors.append({'batch_start': current_line - len(batch), 'error': str(e)})
        
        # Update job status
        if job:
            job.status = 'completed' if failed == 0 else 'completed_with_errors'
            job.records_processed = imported
            job.records_failed = failed
            job.completed_at = timezone.now()
            job.save()
        
        result = {
            'status': 'completed',
            'imported': imported,
            'failed': failed,
            'total': imported + failed
        }
        
        progress.complete(result)
        
        return result
        
    except FileNotFoundError:
        error_msg = f"File not found: {file_path}"
        if job:
            job.status = 'failed'
            job.records_failed = -1
            job.save()
        progress.fail(error_msg)
        raise


@shared_task(
    bind=True,
    name='apps.tasks.import_tasks.import_large_dataset',
    queue='bulk',
    priority=2,
    max_retries=2,
    default_retry_delay=180,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=900,
    retry_jitter=True,
)
def import_large_dataset(self, file_path: str) -> dict:
    """
    Import large dataset using streaming and bulk_update.
    Designed for very large files - memory bounded.
    
    Args:
        file_path: Path to data file (CSV or JSON)
        
    Returns:
        Dict with processed count
    """
    progress = ProgressTracker(self.request.id, total_steps=100)
    progress.start()
    
    processed = 0
    batch_size = 500
    
    # Detect file type and stream accordingly
    if file_path.endswith('.csv'):
        processed = _stream_csv_and_import(file_path, progress, batch_size)
    elif file_path.endswith('.json'):
        processed = _stream_json_and_import(file_path, progress, batch_size)
    else:
        raise ValueError(f"Unsupported file format: {file_path}")
    
    progress.complete({'processed': processed})
    
    return {'processed': processed}


def _stream_csv_and_import(file_path: str, progress: ProgressTracker, batch_size: int) -> int:
    """
    Stream CSV file and import using bulk operations.
    Memory-bounded: never loads entire file.
    """
    from django.utils import timezone
    from django.db import transaction
    
    processed = 0
    
    with open(file_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        batch = []
        
        for row in reader:
            # Parse without loading entire file
            try:
                record = {
                    'sku': row['sku'],
                    'name': row['name'],
                    'price': float(row['price']),
                    'stock': int(row['stock'])
                }
                batch.append(record)
            except (ValueError, KeyError) as e:
                logger.warning(f"Skipping invalid row: {e}")
                continue
            
            # Bulk update when batch is full
            if len(batch) >= batch_size:
                with transaction.atomic():
                    for record in batch:
                        Product.objects.update_or_create(
                            sku=record['sku'],
                            defaults=record
                        )
                processed += len(batch)
                batch = []
                
                # Update progress (10% increments)
                new_percentage = min(90, (processed / 10000) * 100)
                progress.update(int(new_percentage), f"Processed {processed} records")
    
    # Process remaining
    if batch:
        with transaction.atomic():
            for record in batch:
                Product.objects.update_or_create(
                    sku=record['sku'],
                    defaults=record
                )
        processed += len(batch)
    
    return processed


def _stream_json_and_import(file_path: str, progress: ProgressTracker, batch_size: int) -> int:
    """
    Stream JSON file and import using bulk operations.
    Uses ijson for streaming JSON parsing.
    """
    try:
        import ijson
    except ImportError:
        # Fallback: load JSON with streaming approach
        return _stream_json_lines_import(file_path, progress, batch_size)
    
    from django.db import transaction
    
    processed = 0
    batch = []
    
    with open(file_path, 'rb') as f:
        # Stream JSON array without loading entire file
        parser = ijson.parse(f)
        
        current_record = {}
        for prefix, event, value in parser:
            if prefix == 'item' and event == 'start_map':
                current_record = {}
            elif prefix == 'item.name' and event == 'string':
                current_record['name'] = value
            elif prefix == 'item.sku' and event == 'string':
                current_record['sku'] = value
            elif prefix == 'item.price' and event in ('number', 'string'):
                current_record['price'] = float(value)
            elif prefix == 'item.stock' and event in ('number', 'string'):
                current_record['stock'] = int(value)
            elif prefix == 'item' and event == 'end_map':
                batch.append(current_record)
                
                if len(batch) >= batch_size:
                    with transaction.atomic():
                        for record in batch:
                            Product.objects.update_or_create(
                                sku=record['sku'],
                                defaults=record
                            )
                    processed += len(batch)
                    batch = []
                    
                    progress.update(
                        min(90, (processed / 10000) * 100),
                        f"Processed {processed} records"
                    )
    
    # Process remaining
    if batch:
        with transaction.atomic():
            for record in batch:
                Product.objects.update_or_create(
                    sku=record['sku'],
                    defaults=record
                )
        processed += len(batch)
    
    return processed


def _stream_json_lines_import(file_path: str, progress: ProgressTracker, batch_size: int) -> int:
    """
    Fallback: JSON Lines format (one JSON object per line).
    """
    from django.db import transaction
    
    processed = 0
    batch = []
    
    with open(file_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            
            try:
                record = json.loads(line)
                batch.append(record)
            except json.JSONDecodeError:
                logger.warning(f"Skipping invalid JSON line")
                continue
            
            if len(batch) >= batch_size:
                with transaction.atomic():
                    for record in batch:
                        Product.objects.update_or_create(
                            sku=record['sku'],
                            defaults=record
                        )
                processed += len(batch)
                batch = []
                progress.update(
                    min(90, (processed / 10000) * 100),
                    f"Processed {processed} records"
                )
    
    if batch:
        with transaction.atomic():
            for record in batch:
                Product.objects.update_or_create(
                    sku=record['sku'],
                    defaults=record
                )
        processed += len(batch)
    
    return processed


@shared_task(
    bind=True,
    name='apps.tasks.import_tasks.bulk_update_prices',
    queue='bulk',
    priority=4,
    max_retries=2,
    default_retry_delay=60,
    autoretry_for=(Exception,),
    retry_backoff=True,
)
def bulk_update_prices(self, category_id: int, percentage_change: float, job_id: int = None) -> dict:
    """
    Bulk update product prices using database-level operations.
    
    Args:
        category_id: Category ID to update
        percentage_change: Percentage change (positive or negative)
        job_id: Optional job ID for tracking
        
    Returns:
        Dict with updated count
    """
    from django.db import transaction
    from django.db.models import F, ExpressionWrapper, FloatField
    
    # Track progress
    progress = ProgressTracker(
        self.request.id,
        total_steps=Product.objects.filter(category_id=category_id).count()
    )
    progress.start()
    
    # Count products
    product_count = Product.objects.filter(category_id=category_id).count()
    
    if product_count == 0:
        progress.complete({'updated': 0})
        return {'updated': 0}
    
    # Use database-level UPDATE for maximum efficiency (Req 6)
    # Single SQL statement updates all products without fetching to Python
    from django.db import connection
    multiplier = 1 + percentage_change / 100
    with connection.cursor() as cursor:
        cursor.execute(
            "UPDATE reports_product SET price = price * %s WHERE category_id = %s",
            [multiplier, category_id]
        )
        updated_count = cursor.rowcount
    
    # Update progress
    progress.complete({'updated': updated_count})
    
    return {'updated': updated_count}


# Import timezone for job completion
from django.utils import timezone
