from typing import Dict, Optional, Any
from pydantic import BaseModel, Field
from .verdicts import Verdict


class ModerationRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=5000)


class StageResult(BaseModel):
    verdict: Verdict
    score: Optional[float] = None
    reason: Optional[str] = None
    latency_ms: Optional[int] = None
    def to_dict(self) -> Dict[str, Any]:
        return {
            "verdict": self.verdict,
            "score": self.score,
            "reason": self.reason,
            "latency_ms": self.latency_ms,
        }

    def get(self, key: str, default: Any = None) -> Any:
        return getattr(self, key, default)


class ModerationResponse(BaseModel):
    final_verdict: Verdict
    stages: Dict[str, StageResult]
