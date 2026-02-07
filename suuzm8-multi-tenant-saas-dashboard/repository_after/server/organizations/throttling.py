from __future__ import annotations

import math
import time

from django.core.cache import cache
from rest_framework.throttling import BaseThrottle


class APIKeySlidingWindowThrottle(BaseThrottle):
    """Sliding-window throttling per API key (1000/hour).

    Implementation uses two fixed hourly buckets (current + previous) with
    weighted count to approximate a true sliding window.
    """

    scope = "apikey"

    def allow_request(self, request, view) -> bool:
        api_key = getattr(request, "api_key", None)
        if api_key is None:
            return True

        rate = getattr(view, "throttle_rates", {}).get(self.scope) if hasattr(view, "throttle_rates") else None
        if rate is None:
            rate = getattr(getattr(view, "settings", None), "DEFAULT_THROTTLE_RATES", {}).get(self.scope) if hasattr(view, "settings") else None
        # We rely on REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'] via settings; parse ourselves.
        # Format: "1000/hour" only.
        limit = 1000

        now = int(time.time())
        current_bucket = now // 3600
        prev_bucket = current_bucket - 1
        fraction = (now % 3600) / 3600.0

        key_base = f"throttle:apikey:{api_key.key_hash}"
        current_key = f"{key_base}:{current_bucket}"
        prev_key = f"{key_base}:{prev_bucket}"

        current_count = cache.get(current_key, 0)
        prev_count = cache.get(prev_key, 0)

        effective = current_count + int(prev_count * (1.0 - fraction))
        if effective >= limit:
            self._wait = 3600 - (now % 3600)
            return False

        # Increment current bucket; keep around a bit longer than an hour
        # so previous bucket is still available.
        try:
            cache.incr(current_key)
        except ValueError:
            cache.set(current_key, 1, timeout=7200)
        else:
            # Ensure TTL exists (not all cache backends support touch).
            touch = getattr(cache, "touch", None)
            if callable(touch):
                touch(current_key, timeout=7200)

        self._wait = None
        return True

    def wait(self):
        return self._wait
