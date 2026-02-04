# High-Throughput Log Stream Optimization

### Run tests (before are expected failures)
```bash
docker compose run --rm app run_before
```

### Run tests (after are expected all pass)
```bash
docker compose run --rm app run_after
```

### Run evaluation (compares both implementations)
```bash
docker compose run --rm app evaluate
```