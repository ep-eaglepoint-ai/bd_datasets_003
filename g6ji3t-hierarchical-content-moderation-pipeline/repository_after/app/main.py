from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.core.logging import logger
from app.infra.sqlite import get_connection, init_db
from app.infra.audit_repo import AuditRepository
from app.pipeline.orchestrator import PipelineOrchestrator


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Moderation service starting...")
    yield
app = FastAPI(
    title="Hierarchical Content Moderation Pipeline",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

_conn = get_connection()
init_db(_conn)
_audit_repo = AuditRepository(_conn)

_orchestrator = PipelineOrchestrator()
app.state.orchestrator = _orchestrator
app.state.audit_repo = _audit_repo
app.include_router(router)
