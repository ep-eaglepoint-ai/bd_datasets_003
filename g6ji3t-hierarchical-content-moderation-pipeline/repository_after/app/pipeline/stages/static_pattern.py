from __future__ import annotations

import json
import re
import time
from pathlib import Path
from typing import List, Pattern, Tuple

from app.core.config import STATIC_PATTERNS_PATH
from app.core.verdicts import Verdict
from app.pipeline.base_stage import ModerationStage, PipelineContext


def _load_patterns(path: Path) -> List[Pattern]:
    if not path.exists():
        raw = {"patterns": ["\\bkill\\b", "\\bhate\\b", "\\bterror\\b"]}
    else:
        raw = json.loads(path.read_text(encoding="utf-8"))

    pats = raw.get("patterns", [])
    compiled: List[Pattern] = []
    for p in pats:
        compiled.append(re.compile(p, flags=re.IGNORECASE))
    return compiled


class StaticPatternStage(ModerationStage):
    stage_name = "static_pattern"

    def __init__(self, next_stage=None):
        super().__init__(next_stage)
        self._patterns = _load_patterns(STATIC_PATTERNS_PATH)

    def _match(self, text: str) -> Tuple[bool, str]:
        for pat in self._patterns:
            m = pat.search(text)
            if m:
                return True, f"Matched pattern: {pat.pattern}"
        return False, ""

    async def evaluate(self, text: str, ctx: PipelineContext) -> tuple[Verdict, dict]:
        t0 = time.perf_counter()

        hit, reason = self._match(text)

        latency_ms = int((time.perf_counter() - t0) * 1000)
        if hit:
            return Verdict.BLOCKED, {
                "verdict": Verdict.BLOCKED,
                "score": 1.0,
                "reason": reason or "Static prohibited pattern detected",
                "latency_ms": latency_ms,
            }

        return Verdict.ALLOWED, {
            "verdict": Verdict.ALLOWED,
            "score": 0.0,
            "reason": "No static patterns matched",
            "latency_ms": latency_ms,
        }
