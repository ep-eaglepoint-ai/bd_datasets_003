from fastapi import FastAPI
from app.api import webhooks, events
from app.database import engine, Base
from app.models import webhook  # Import models to ensure they are registered with Base

app = FastAPI(title="Webhook Delivery System")

# Create tables
Base.metadata.create_all(bind=engine)

app.include_router(webhooks.router, prefix="/api/webhooks", tags=["webhooks"])
app.include_router(events.router, prefix="/api/events", tags=["events"])


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
