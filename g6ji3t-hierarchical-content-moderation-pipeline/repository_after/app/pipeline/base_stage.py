from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Optional, Any

from app.core.verdicts import Verdict, merge_verdict


@dataclass
class PipelineContext:
    """
    Shared mutable context passed through all stages.
    """
    final_verdict: Verdict = Verdict.ALLOWED
    stages: Dict[str, Any] = field(default_factory=dict) 
    meta: Dict[str, Any] = field(default_factory=dict)  


class ModerationStage:
    """
    Chain of Responsibility base stage.
    Each stage:
      - evaluates input
      - writes its StageResult into ctx.stages[stage_name]
      - may escalate ctx.final_verdict
      - calls next stage (if any) depending on rules
    """

    stage_name: str = "base"

    def __init__(self, next_stage: Optional["ModerationStage"] = None):
        self._next = next_stage

    def set_next(self, next_stage: "ModerationStage") -> "ModerationStage":
        self._next = next_stage
        return next_stage

    async def handle(self, text: str, ctx: PipelineContext) -> PipelineContext:
        verdict, result = await self.evaluate(text, ctx)
        ctx.stages[self.stage_name] = result
        ctx.final_verdict = merge_verdict(ctx.final_verdict, verdict)
        if ctx.final_verdict == Verdict.BLOCKED:
            return ctx
        if self._next is None:
            return ctx
        return await self._next.handle(text, ctx)

    async def evaluate(self, text: str, ctx: PipelineContext) -> tuple[Verdict, dict]:
        """
        Must be implemented by subclasses.
        Return: (verdict, stage_result_dict)
        stage_result_dict should match app.core.models.StageResult fields:
          verdict, score, reason, latency_ms
        """
        raise NotImplementedError
