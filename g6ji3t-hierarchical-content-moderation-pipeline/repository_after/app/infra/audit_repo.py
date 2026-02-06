from __future__ import annotations

import sqlite3
from typing import Any, Dict, Optional

from app.core.models import ModerationResponse


def _coerce_stage(v: Optional[Any]) -> Dict[str, Any]:
    """
    Stages may be stored as:
    - dict (already-serialized)
    - StageResult / pydantic model
    - None

    Normalize to dict-like fields that are safe to persist to sqlite.
    """
    if v is None:
        return {"verdict": None, "score": None, "reason": None, "latency_ms": None}
    if isinstance(v, dict):
        verdict = v.get("verdict")
        score = v.get("score")
        reason = v.get("reason")
        latency_ms = v.get("latency_ms")
    else:
        verdict = getattr(v, "verdict", None)
        score = getattr(v, "score", None)
        reason = getattr(v, "reason", None)
        latency_ms = getattr(v, "latency_ms", None)
        if verdict is None and hasattr(v, "model_dump"):
            try:
                d = v.model_dump()
                verdict = d.get("verdict")
                score = d.get("score")
                reason = d.get("reason")
                latency_ms = d.get("latency_ms")
            except Exception:
                pass

    if hasattr(verdict, "value"):
        verdict = verdict.value
    if score is not None:
        try:
            score = float(score)
        except Exception:
            score = None
    if latency_ms is not None:
        try:
            latency_ms = int(latency_ms)
        except Exception:
            latency_ms = None
    if reason is not None:
        try:
            reason = str(reason)
        except Exception:
            reason = None

    return {
        "verdict": verdict,
        "score": score,
        "reason": reason,
        "latency_ms": latency_ms,
    }


class AuditRepository:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    def insert_audit(self, content: str, resp: ModerationResponse) -> None:
        stages = resp.stages or {}

        s = _coerce_stage(stages.get("static_pattern"))
        f = _coerce_stage(stages.get("fuzzy_similarity"))
        m = _coerce_stage(stages.get("ml_inference"))

        self.conn.execute(
            """
            INSERT INTO moderation_audit (
                content, final_verdict,

                static_verdict, static_score, static_reason, static_latency_ms,
                fuzzy_verdict, fuzzy_score, fuzzy_reason, fuzzy_latency_ms,
                ml_verdict, ml_score, ml_reason, ml_latency_ms
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                content,
                getattr(resp.final_verdict, "value", resp.final_verdict),

                s["verdict"], s["score"], s["reason"], s["latency_ms"],
                f["verdict"], f["score"], f["reason"], f["latency_ms"],
                m["verdict"], m["score"], m["reason"], m["latency_ms"],
            ),
        )
        self.conn.commit()
