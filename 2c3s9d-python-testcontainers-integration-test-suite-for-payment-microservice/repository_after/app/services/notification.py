import httpx


class NotificationService:
    def __init__(self):
        self.email_api_url = "https://api.emailservice.com/send"

    async def send_refund_notification(self, customer_id: str, refund):
        async with httpx.AsyncClient() as client:
            await client.post(
                self.email_api_url,
                json={
                    "to": customer_id,
                    "template": "refund_confirmation",
                    "data": {"amount": refund.amount, "refund_id": refund.id}
                },
                timeout=5.0
            )
