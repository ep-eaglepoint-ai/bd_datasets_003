"""
Single endpoint: POST /dashboard with body {"events": [...]}.
Returns dashboard metrics from the reference compute_dashboard(events).
"""
from fastapi import FastAPI
from pydantic import BaseModel

from dashboard import compute_dashboard

app = FastAPI(title="Dashboard aggregation")


class DashboardRequest(BaseModel):
    events: list[dict]


@app.post("/dashboard")
def post_dashboard(req: DashboardRequest):
    """Compute dashboard metrics for the given event list."""
    return compute_dashboard(req.events)
