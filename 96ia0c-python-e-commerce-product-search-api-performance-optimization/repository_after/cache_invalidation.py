import asyncio

from sqlalchemy import event

from cache import invalidate_product_cache
from database import get_redis
from models import Product


async def _invalidate(product_id: int | None) -> None:
    redis = await get_redis()
    await invalidate_product_cache(redis, product_id)


def _schedule(product_id: int | None) -> None:
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return
    loop.create_task(_invalidate(product_id))


@event.listens_for(Product, "after_insert")
def _after_insert(mapper, connection, target) -> None:
    _schedule(getattr(target, "id", None))


@event.listens_for(Product, "after_update")
def _after_update(mapper, connection, target) -> None:
    _schedule(getattr(target, "id", None))


@event.listens_for(Product, "after_delete")
def _after_delete(mapper, connection, target) -> None:
    _schedule(getattr(target, "id", None))
