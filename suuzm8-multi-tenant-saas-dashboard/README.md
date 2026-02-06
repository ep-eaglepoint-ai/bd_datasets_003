# SUUZM8 - Multi -Tenant SaaS Dashboard

## Test repository before command

`No repository before`

## Test repository_after command

```bash
docker compose run --rm test
```

This command runs:

- Backend: `pytest` with `pytest-cov` and `--cov-fail-under=80`
- Frontend: `vitest`

## Evaluation

```bash
docker compose run --rm test python3 evaluation/evaluation.py
```
