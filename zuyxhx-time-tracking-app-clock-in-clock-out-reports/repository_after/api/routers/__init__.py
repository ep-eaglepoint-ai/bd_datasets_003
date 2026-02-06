"""API routers."""

from .auth import router as auth_router
from .time import router as time_router
from .reports import router as reports_router

__all__ = ["auth_router", "time_router", "reports_router"]
