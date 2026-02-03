# LRU Cache Test Suite

## Commands

### 1. Setup
```bash
docker compose build
```

### 2. Run Tests on repository_before
```bash
docker compose run --rm app bash -c 'cd repository_before && python -m pytest || true'
```

### 3. Run Tests on repository_after
```bash
docker compose run --rm app bash -c 'cd repository_after && python -m pytest lrucache/test_lru.py -q --tb=no --no-header -r no'
```

### 4. Run Meta Tests
```bash
docker compose run --rm app python -m pytest tests/test_meta.py -v -s
```

### 5. Run Evaluation
```bash
docker compose run --rm app python evaluation/evaluation.py
```

## Understanding Meta Test Output

```
tests/test_meta.py::test_suite_detects_broken_get_lru_order
--- Running inner test against broken_get_impl ---
lrucache/test_lru.py::test_lru_eviction_after_access FAILED    ← Inner test run
meta outcomes: 1 failure                                        ← Meta sees failure
PASSED - Test suite detected the bug!                           ← Meta PASSES!
```

**Don't be alarmed by "FAILED" messages!** These are inner test runs against broken code. Failures prove your test suite works correctly.

### Final Result
```
======= 8 passed in 0.12s =======
```

All 8 meta tests passing means:
- ✅ Catches broken get() LRU order
- ✅ Catches broken put() LRU refresh
- ✅ Catches missing TTL expiration
- ✅ Catches wrong eviction order
- ✅ Catches missing capacity validation
- ✅ Catches broken clear()
- ✅ Catches broken size()
- ✅ Passes correct implementation

## Structure

```
.
├── Dockerfile
├── README.md
├── docker-compose.yml
├── requirements.txt
├── evaluation/
│   ├── evaluation.py
│   └── reports/
├── patches/
│   └── diff.patch
├── repository_before/
│   └── main.py
├── repository_after/
│   └── lrucache/
│       ├── __init__.py
│       ├── lru.py
│       └── test_lru.py
├── tests/
│   ├── test_meta.py
│   └── resources/
│       ├── broken_capacity_impl.py
│       ├── broken_clear_impl.py
│       ├── broken_eviction_impl.py
│       ├── broken_get_impl.py
│       ├── broken_put_impl.py
│       ├── broken_size_impl.py
│       ├── broken_ttl_impl.py
│       └── correct_impl.py
└── trajectory/
    └── trajectory.md
```