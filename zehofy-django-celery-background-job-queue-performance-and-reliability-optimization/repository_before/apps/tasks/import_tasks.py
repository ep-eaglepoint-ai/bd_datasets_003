from celery import shared_task
from apps.reports.models import ImportJob, Product
import csv
import json


@shared_task
def import_products_from_csv(file_path, job_id):
    job = ImportJob.objects.get(id=job_id)
    job.status = 'processing'
    job.save()
    
    with open(file_path, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            Product.objects.create(
                name=row['name'],
                sku=row['sku'],
                price=float(row['price']),
                category_id=int(row['category_id'])
            )
    
    job.status = 'completed'
    job.save()


@shared_task
def import_users_from_json(file_path, job_id):
    job = ImportJob.objects.get(id=job_id)
    job.status = 'processing'
    job.save()
    
    from django.contrib.auth.models import User
    
    with open(file_path, 'r') as f:
        users_data = json.load(f)
    
    for user_data in users_data:
        User.objects.create_user(
            username=user_data['username'],
            email=user_data['email'],
            password=user_data['password'],
            first_name=user_data.get('first_name', ''),
            last_name=user_data.get('last_name', '')
        )
    
    job.status = 'completed'
    job.save()


@shared_task
def bulk_update_prices(category_id, percentage_change, job_id):
    job = ImportJob.objects.get(id=job_id)
    job.status = 'processing'
    job.save()
    
    products = Product.objects.filter(category_id=category_id)
    
    for product in products:
        product.price = product.price * (1 + percentage_change / 100)
        product.save()
    
    job.status = 'completed'
    job.save()
