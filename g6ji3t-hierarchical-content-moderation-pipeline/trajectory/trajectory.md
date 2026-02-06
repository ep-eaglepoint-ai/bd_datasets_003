# Trajectory: How I Built the Hierarchical Moderation Pipeline

I treated this task like building a real backend service, not just something to pass tests.  
The core idea was to process content step by step and stop early when possible.

I designed everything as a **pipeline** using the chain pattern.  
Each moderation stage does one job and then forwards the content.  
This made the system easier to extend later (like adding image or link checks).  
I used this idea based on the Chain of Responsibility pattern  
https://refactoring.guru/design-patterns/chain-of-responsibility

I started with the **static pattern filter** because it’s the fastest.  
If content clearly matches banned keywords or regex patterns, it should block immediately.

Then I added the **fuzzy similarity filter** to catch obfuscated words like `Pr0hibitedW0rd`.  
I used Levenshtein distance only against a small blocked-phrase list to avoid false positives.  
Reference I used here:  
https://en.wikipedia.org/wiki/Levenshtein_distance

The **ML inference stage** is treated as unreliable by default.  
It runs async, has a timeout, and uses a circuit breaker so failures don’t cascade.  
If ML fails, the system returns **FLAGGED** instead of blocking users.  
I followed common circuit breaker ideas from here:  
https://martinfowler.com/bliki/CircuitBreaker.html

FastAPI is only the API layer.  
All real logic lives in the pipeline and orchestrator, not in the route handlers.  
This keeps request handling clean  
https://fastapi.tiangolo.com/tutorial/

Every request is written to SQLite with scores and final verdict for auditing.  
Audit logging must never break the main response.

I tested concurrency, fuzzy edge cases, and circuit breaker recovery using pytest-asyncio and Docker.  
After everything passed, I added a small evaluation script that outputs a JSON report.
