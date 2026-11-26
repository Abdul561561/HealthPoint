"""
HealthPoint In-Memory Sliding Window Rate Limiter
=================================================
Provides lightweight per-process rate limiting for authentication, OTP verification,
OTP resend, login, and AI chat endpoints without requiring paid external services.

IMPORTANT LIMITATIONS:
- State is stored strictly in process memory (`defaultdict(deque)`).
- Limits reset whenever the server restarts or redeploys.
- Limits are NOT shared across multiple worker processes or horizontally scaled instances.
- Therefore, this limiter is not persistent or distributed protection; for multi-instance
  deployments, pair with a shared backend store (e.g., Redis) or edge/WAF rate limiting.
"""

import time
from collections import defaultdict, deque
from threading import Lock
from fastapi import HTTPException, status


class SlidingWindowRateLimiter:
    """Per-process in-memory sliding-window rate limiter (non-persistent)."""

    def __init__(self):
        self._buckets = defaultdict(deque)
        self._lock = Lock()

    def check(self, scope: str, identifier: str, max_requests: int, window_seconds: int) -> None:
        key = f"{scope}:{identifier.lower()}"
        now = time.monotonic()
        cutoff = now - window_seconds

        with self._lock:
            q = self._buckets[key]
            while q and q[0] < cutoff:
                q.popleft()

            if len(q) >= max_requests:
                retry_after = max(1, int(window_seconds - (now - q[0])))
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Too many requests. Please try again in {retry_after} seconds.",
                    headers={"Retry-After": str(retry_after)},
                )
            q.append(now)

    def reset(self, scope: str = None, identifier: str = None) -> None:
        with self._lock:
            if scope and identifier:
                self._buckets.pop(f"{scope}:{identifier.lower()}", None)
            else:
                self._buckets.clear()


rate_limiter = SlidingWindowRateLimiter()
