from __future__ import annotations

import asyncio
import random
import time
from dataclasses import dataclass

from app.core.config import (
    ML_PROXY_LATENCY_MS,
    ML_PROXY_TIMEOUT_MS,
    CIRCUIT_BREAKER_FAILURE_THRESHOLD,
    CIRCUIT_BREAKER_RESET_SECONDS,
)
from app.core.verdicts import Verdict
from app.pipeline.base_stage import ModerationStage, PipelineContext


@dataclass
class CircuitBreakerState:
    failures: int = 0
    open_until_monotonic: float = 0.0

    def is_open(self) -> bool:
        return time.monotonic() < self.open_until_monotonic

    def record_success(self) -> None:
        self.failures = 0
        self.open_until_monotonic = 0.0

    def record_failure(self) -> bool:
        """
        Records a failure and returns True if this call opened the breaker.
        """
        self.failures += 1
        if self.failures >= CIRCUIT_BREAKER_FAILURE_THRESHOLD and not self.is_open():
            self.open_until_monotonic = time.monotonic() + CIRCUIT_BREAKER_RESET_SECONDS
            return True
        return False


class MlInferenceProxyStage(ModerationStage):
    stage_name = "ml_inference"

    def __init__(self, next_stage=None):
        super().__init__(next_stage)
        self._breaker = CircuitBreakerState()

        self.force_fail: bool = False
        self.force_latency_ms: int | None = None

    async def _mock_external_call(self, text: str) -> float:
        """
        Simulated external service:
        - base delay
        - returns probability score 0..1
        - can be forced to fail/slow for tests
        """
        if self.force_fail:
            await asyncio.sleep(0.05)
            raise RuntimeError("Simulated ML service failure")

        delay_ms = self.force_latency_ms if self.force_latency_ms is not None else ML_PROXY_LATENCY_MS
        await asyncio.sleep(delay_ms / 1000.0)

        base = min(0.9, max(0.05, len(text) / 1000.0))
        jitter = random.random() * 0.15
        return float(min(1.0, base + jitter))

    async def evaluate(self, text: str, ctx: PipelineContext) -> tuple[Verdict, dict]:
        t0 = time.perf_counter()

        # Circuit breaker open => fail-safe FLAGGED immediately
        if self._breaker.is_open():
            latency_ms = int((time.perf_counter() - t0) * 1000)
            return Verdict.FLAGGED, {
                "verdict": Verdict.FLAGGED,
                "score": None,
                "reason": "Breaker open: ML stage skipped (fail-safe flagged)",
                "latency_ms": latency_ms,
            }

        try:
            score = await asyncio.wait_for(
                self._mock_external_call(text),
                timeout=ML_PROXY_TIMEOUT_MS / 1000.0,
            )
            self._breaker.record_success()

            latency_ms = int((time.perf_counter() - t0) * 1000)
            if score >= 0.85:
                return Verdict.FLAGGED, {
                    "verdict": Verdict.FLAGGED,
                    "score": score,
                    "reason": "ML risk score high (manual review required)",
                    "latency_ms": latency_ms,
                }

            return Verdict.ALLOWED, {
                "verdict": Verdict.ALLOWED,
                "score": score,
                "reason": "ML risk score acceptable",
                "latency_ms": latency_ms,
            }

        except Exception as e:
            breaker_opened_now = self._breaker.record_failure()
            latency_ms = int((time.perf_counter() - t0) * 1000)
            if breaker_opened_now:
                reason = f"Breaker opened after ML failure (fail-safe flagged): {type(e).__name__}"
            else:
                reason = f"ML stage failed/timeout (fail-safe flagged): {type(e).__name__}"

            return Verdict.FLAGGED, {
                "verdict": Verdict.FLAGGED,
                "score": None,
                "reason": reason,
                "latency_ms": latency_ms,
            }
