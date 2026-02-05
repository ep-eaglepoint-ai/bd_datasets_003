### Test for Before
```bash
docker compose run --rm -e "PYTHONPATH=/app/repository_before:/app" app /bin/bash -c "pytest -v tests/test_app.py || true"
```

### Test for After
```bash
docker compose run --rm app /bin/bash -c "pytest -v tests/test_app.py"
```

### Full Evaluation (Before vs After)
```bash
docker compose run --rm app /bin/bash -c "python3 evaluation/evaluation.py"
```


