### Test for Before
```bash
docker compose run --rm -e PYTHONPATH=/app/repository_before:/app app pytest -v -p no:cacheprovider tests/test_app.py || true
```

### Test for After
```bash
docker compose run --rm app pytest -v -p no:cacheprovider tests/test_app.py
```

### Full Evaluation (Before vs After)
```bash
docker compose run --rm app python3 evaluation/evaluation.py
```

