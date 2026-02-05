# Consistent Hashing Virtual Node Rebalancer

## Project Context
The goal is to implement a high-performance consistent hashing library in Go with virtual node support and rebalance plan generation. The original system used modulo-based partitioning which created hot spots and caused massive key reassignment during cluster changes. This implementation provides O(log N) lookups, thread-safe atomic updates, and minimal data migration when nodes are added or removed.

## Commands

### 1. Test Before Implementation (Expected to Fail)
Tests the empty/broken state in `repository_before`.

```bash
docker compose run --rm app bash -c 'cd repository_before && go test -v ./... || true'
```

### 2. Test After Implementation (Expected to Pass)
Runs the comprehensive test suite validating functional correctness, distribution quality, concurrency safety, and memory usage.

```bash
docker compose run --rm app bash -c 'cd tests && go test -v .'
```

### 3. Run Evaluation Script
Generates the evaluation report comparing before/after states.

```bash
docker compose run --rm app go run evaluation/evaluate.go
```