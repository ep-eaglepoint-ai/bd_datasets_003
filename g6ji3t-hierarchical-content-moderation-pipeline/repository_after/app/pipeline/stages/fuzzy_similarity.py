from __future__ import annotations

import time
from pathlib import Path
from typing import List, Tuple

from app.core.config import BLOCKED_PHRASES_PATH, FUZZY_DISTANCE_THRESHOLD
from app.core.verdicts import Verdict
from app.pipeline.base_stage import ModerationStage, PipelineContext
from app.utils.levenshtein import levenshtein_distance


def _load_blocked_phrases(path: Path) -> List[str]:
    if not path.exists():
        return ["ProhibitedWord"]
    lines = []
    for line in path.read_text(encoding="utf-8").splitlines():
        v = line.strip()
        if not v or v.startswith("#"):
            continue
        lines.append(v)
    return lines or ["ProhibitedWord"]


def _normalize(s: str) -> str:
    return "".join(ch for ch in s.lower() if not ch.isspace())


class FuzzySimilarityStage(ModerationStage):
    stage_name = "fuzzy_similarity"

    def __init__(self, next_stage=None):
        super().__init__(next_stage)
        self._blocked = _load_blocked_phrases(BLOCKED_PHRASES_PATH)

    def _min_distance(self, text: str) -> Tuple[int, str]:
        nt = _normalize(text)

        best = 10**9
        best_phrase = ""
        for phrase in self._blocked:
            np = _normalize(phrase)
            if abs(len(nt) - len(np)) > FUZZY_DISTANCE_THRESHOLD + 2:
                continue

            d = levenshtein_distance(nt, np)
            if d < best:
                best = d
                best_phrase = phrase
                if best == 0:
                    break
        return best, best_phrase

    async def evaluate(self, text: str, ctx: PipelineContext) -> tuple[Verdict, dict]:
        t0 = time.perf_counter()

        dist, phrase = self._min_distance(text)
        latency_ms = int((time.perf_counter() - t0) * 1000)

        if dist <= FUZZY_DISTANCE_THRESHOLD:
            score = max(0.0, 1.0 - (dist / max(1, len(phrase))))
            return Verdict.BLOCKED, {
                "verdict": Verdict.BLOCKED,
                "score": float(score),
                "reason": f"Fuzzy match to blocked phrase '{phrase}' (distance={dist})",
                "latency_ms": latency_ms,
            }

        return Verdict.ALLOWED, {
            "verdict": Verdict.ALLOWED,
            "score": 0.0,
            "reason": "No fuzzy blocked phrase match",
            "latency_ms": latency_ms,
        }
