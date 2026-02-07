import json
import aio_pika
from app.config import get_rabbitmq_connection


class EventPublisher:
    async def publish(self, event_type: str, data: dict):
        connection = await get_rabbitmq_connection()
        channel = await connection.channel()
        exchange = await channel.declare_exchange("payments", aio_pika.ExchangeType.TOPIC)

        message = aio_pika.Message(
            body=json.dumps({"type": event_type, "data": data}).encode(),
            delivery_mode=aio_pika.DeliveryMode.PERSISTENT
        )
        await exchange.publish(message, routing_key=event_type)
