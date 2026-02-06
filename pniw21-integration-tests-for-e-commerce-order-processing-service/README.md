# PNIW21 - Integration Tests for E-Commerce Order Processing Service

## Before Test Docker Command

```bash
docker compose run --rm tests
```

## After Test Docker Command

```bash
docker compose run --rm tests npm run test:meta
```

## Evaluation Docker Command

```bash
docker compose run --rm tests node evaluation/evaluation.js
```
