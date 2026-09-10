"""Redis-backed rate limiters.

Two shapes:

* ``take_provider_token`` — a token bucket that throttles our *outbound* calls
  to a given provider, refilling at a steady rate (design doc 7.2).
* ``enforce_user_limit`` — a fixed-window counter that caps how often a single
  user can hit an expensive endpoint (design doc 9).

Both **fail open**: if Redis is unreachable the call is allowed and a warning
is logged, so a Redis outage degrades limiting rather than the whole API.
"""

import logging
import time

from redis.asyncio import Redis
from redis.exceptions import RedisError

log = logging.getLogger(__name__)


class RateLimited(Exception):
    """Raised when a limiter rejects a call. ``retry_after`` is seconds."""

    def __init__(self, retry_after: float):
        super().__init__(f"rate limited, retry after {retry_after:.1f}s")
        self.retry_after = retry_after


# Atomic token bucket. KEYS[1]=bucket key. ARGV: capacity, refill/sec, now, cost.
# Returns {allowed(0|1), retry_after_ms}.
_TOKEN_BUCKET = """
local key      = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill   = tonumber(ARGV[2])
local now      = tonumber(ARGV[3])
local cost     = tonumber(ARGV[4])

local data   = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(data[1])
local ts     = tonumber(data[2])
if tokens == nil then tokens = capacity; ts = now end

tokens = math.min(capacity, tokens + math.max(0, now - ts) * refill)

local allowed = 0
local retry_after = 0
if tokens >= cost then
    allowed = 1
    tokens = tokens - cost
else
    retry_after = (cost - tokens) / refill
end

redis.call('HMSET', key, 'tokens', tokens, 'ts', now)
redis.call('EXPIRE', key, math.ceil(capacity / refill) + 1)
return {allowed, math.floor(retry_after * 1000)}
"""


async def take_provider_token(
    redis: Redis, provider: str, *, capacity: int, refill_per_second: float, cost: int = 1
) -> None:
    key = f"ratelimit:provider:{provider}"
    try:
        allowed, retry_after_ms = await redis.eval(
            _TOKEN_BUCKET, 1, key, capacity, refill_per_second, time.time(), cost
        )
    except RedisError as exc:
        log.warning("provider rate limiter unavailable, allowing call: %s", exc)
        return
    if not allowed:
        raise RateLimited(retry_after_ms / 1000)


async def enforce_user_limit(
    redis: Redis, action: str, user_id, *, limit: int, window_seconds: int = 60
) -> None:
    key = f"ratelimit:user:{action}:{user_id}"
    try:
        count = await redis.incr(key)
        if count == 1:
            await redis.expire(key, window_seconds)
        ttl = await redis.ttl(key) if count > limit else 0
    except RedisError as exc:
        log.warning("user rate limiter unavailable, allowing call: %s", exc)
        return
    if count > limit:
        raise RateLimited(float(ttl if ttl and ttl > 0 else window_seconds))
