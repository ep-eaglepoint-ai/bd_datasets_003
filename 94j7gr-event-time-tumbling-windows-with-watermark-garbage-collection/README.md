# 94J7GR - Event-Time Tumbling Windows with Watermark Garbage Collection

**Category:** sft

## Overview
- Task ID: 94J7GR
- Title: Event-Time Tumbling Windows with Watermark Garbage Collection
- Category: sft
- Repository: ep-eaglepoint-ai/bd_datasets_002
- Branch: 94j7gr-event-time-tumbling-windows-with-watermark-garbage-collection

## Requirements
- Windows must be defined by Event Time (data timestamp), not Processing Time (arrival time).
- Must calculate GlobalWatermark = Max(ObservedTimestamp) - AllowedLateness.
- A window [Start, End) is closed only when GlobalWatermark > End.
- Must use a nested map structure (e.g., map[key]map[windowStart]value) to store partial aggregates.
- Upon window closure, the specific window entry must be delete()'d from the map to prevent OOM.
- Must use sync.RWMutex (or sync.Map) to protect state during concurrent ingestion and emission.
- Late events (arriving after the window is closed/deleted) must be dropped/ignored.
- Must handle multiple distinct keys simultaneously without cross-contamination.
- Must emit results (e.g., via a channel or callback) immediately upon window closure.
- The watermark must strictly increase (monotonic); receiving an old event should not decrease the watermark.

## Metadata
- Programming Languages: Go (Golang 1.18+)
- Frameworks: (none)
- Libraries: (none)
- Databases: (none)
- Tools: (none)
- Best Practices: (none)
- Performance Metrics: (none)
- Security Standards: (none)

## Structure
- repository_before/: baseline code (`__init__.py`)
- repository_after/: optimized code (`__init__.py`)
- tests/: test suite (`__init__.py`)
- evaluation/: evaluation scripts (`evaluation.py`)
- instances/: sample/problem instances (JSON)
- patches/: patches for diffing
- trajectory/: notes or write-up (Markdown)

## Quick start
- Run tests locally: `python -m pytest -q tests`
- With Docker: `docker compose up --build --abort-on-container-exit`
- Add dependencies to `requirements.txt`

## Notes
- Keep commits focused and small.
- Open a PR when ready for review.
