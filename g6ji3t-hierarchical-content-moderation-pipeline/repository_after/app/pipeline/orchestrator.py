from __future__ import annotations

from app.core.models import ModerationResponse, StageResult
from app.pipeline.base_stage import PipelineContext
from app.pipeline.stages.static_pattern import StaticPatternStage
from app.pipeline.stages.fuzzy_similarity import FuzzySimilarityStage
from app.pipeline.stages.ml_proxy import MlInferenceProxyStage


class PipelineOrchestrator:
    def __init__(self) -> None:
        self.static_stage = StaticPatternStage()
        self.fuzzy_stage = FuzzySimilarityStage()
        self.ml_stage = MlInferenceProxyStage()

        self.static_stage.set_next(self.fuzzy_stage).set_next(self.ml_stage)
        self._root = self.static_stage

    async def run(self, text: str) -> ModerationResponse:
        ctx = PipelineContext()
        ctx = await self._root.handle(text, ctx)
        normalized_stages: dict[str, StageResult] = {}
        for k, v in (ctx.stages or {}).items():
            if isinstance(v, StageResult):
                normalized_stages[k] = v
            elif isinstance(v, dict):
                normalized_stages[k] = StageResult(**v)
            else:
                normalized_stages[k] = StageResult(
                    verdict=getattr(v, "verdict", None),
                    score=getattr(v, "score", None),
                    reason=getattr(v, "reason", None),
                    latency_ms=getattr(v, "latency_ms", None),
                )

        return ModerationResponse(
            final_verdict=ctx.final_verdict,
            stages=normalized_stages,
        )
