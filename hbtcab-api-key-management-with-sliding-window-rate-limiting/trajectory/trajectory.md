# Trajectory: API Key Management & Sliding Window Rate Limiting

## The problem: “Open door” authentication
Right now the API is effectively “JWT-only”. If a user wants an automated system (CI/CD, integrations, scripts) to call the API, they end up sharing their own JWT. That’s risky and hard to control.

On top of that, once a client is authenticated there’s no guardrail against abuse. A misconfigured integration could spam requests and degrade the service for everyone.

What we need:
1. API keys designed for automation.
2. Rate limits that scale by subscription tier.

## The solution: authentication + traffic control
We introduce two pieces that work together:
1. **Dual auth (“gatekeeper”)**
   - Accept either `Bearer {jwt}` or `ApiKey {key}`.
2. **Sliding-window rate limiting (“traffic controller”)**
   - Track requests per API key in Redis.
   - Enforce limits based on the owning user’s tier.

## Why sliding window + Redis?

### Fixed window is easy to game
With a fixed hourly counter (e.g. resets on the hour), a client can burst at the boundary:
- 100 requests at 1:59
- 100 requests at 2:01

That’s 200 requests in ~2 minutes while still “respecting” the hourly limit.

**Sliding window** solves this by always looking at the last 60 minutes from “now”.

### Redis sorted sets model a sliding window naturally
To implement “requests in the last hour” we need timestamps.
- **Data structure:** Redis `ZSET`
- **Score:** request timestamp (ms)
- **Member:** unique value per request

On each request:
1. Remove entries older than the window.
2. Count remaining entries.
3. If under limit, add the new timestamp.

### Lua makes it atomic
Doing “remove → count → add” as separate Redis commands can race under concurrency.

Wrapping the logic in a Lua script ensures Redis executes the whole sequence atomically.

## Execution summary

1. **Secure storage for API keys**
   - Store only a cryptographic hash of the secret (never plaintext).
   - Return the full key exactly once at creation.
   - Use constant-time comparison (`crypto.timingSafeEqual`) during validation.

2. **Unified authentication middleware**
   - `Bearer` headers follow the existing JWT flow.
   - `ApiKey` headers:
     - parse `dk_{environment}_{secret}`
     - hash the secret
     - look up candidates by prefix
     - constant-time compare hashes
   - Rotation:
     - rotating a key revokes the old key but keeps it valid for a 24h grace period.

3. **Rate limiting (Redis + Lua)**
   - Use sliding window over 1 hour.
   - Determine limit from the user tier at request time:
     - free: 100/hr
     - pro: 1000/hr
     - enterprise: 10000/hr
   - Return headers on every request:
     - `X-RateLimit-Limit`
     - `X-RateLimit-Remaining`
     - `X-RateLimit-Reset`

4. **Usage tracking (Postgres upsert)**
   - Track usage per key, endpoint, method, day.
   - Increment counters via upsert instead of inserting raw request rows.

---

## Recommended reading

1. **Sliding window rate limiting**
   - [YouTube: Rate Limiting Algorithms](https://www.youtube.com/watch?v=CRrE31G36zI)

2. **Timing attacks and constant-time comparison**
   - [Snyk: Node.js Timing Attacks](https://snyk.io/blog/node-js-timing-attacks-constant-time-comparison/)

3. **Atomic operations in Redis with Lua**
   - [Redis Docs: Scripting with Lua](https://redis.io/docs/manual/programmability/)