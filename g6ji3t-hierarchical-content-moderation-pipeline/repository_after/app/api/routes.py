from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from app.core.models import ModerationRequest, ModerationResponse
from app.core.logging import logger
from app.utils.sanitizer import sanitize_text

router = APIRouter()


@router.post("/moderate", response_model=ModerationResponse)
async def moderate(req: ModerationRequest, request: Request) -> ModerationResponse:
    text = sanitize_text(req.content)

    if not text:
        raise HTTPException(status_code=400, detail="content must not be empty")

    orchestrator = request.app.state.orchestrator
    audit_repo = request.app.state.audit_repo

    resp = await orchestrator.run(text)

    # all verdicts must be logged to SQLite
    try:
        audit_repo.insert_audit(text, resp)
    except Exception as e:
        logger.error(f"audit insert failed: {type(e).__name__}: {e}")

    return resp
