from celery import Celery
from app.config import REDIS_URL
import asyncio
from app.services.delivery_worker import process_delivery_by_id

celery_app = Celery("webhook_delivery", broker=REDIS_URL, backend=REDIS_URL)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)

@celery_app.task(name="delivery_task")
def delivery_task(delivery_id: str):
    """Celery task wrapper for async delivery"""
    asyncio.run(process_delivery_by_id(delivery_id))
