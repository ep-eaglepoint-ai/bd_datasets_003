# ZK4I3U - Optimization and Refactoring of an Intentionally Inefficient Whitening Algorithm

## Before Test Docker Command

docker compose run --rm -e REPO_UNDER_TEST=repository_before app pytest -q tests

## After Test Docker Command

docker compose run --rm -e REPO_UNDER_TEST=repository_after app pytest -q tests

## Evaluation Docker Command

docker compose run --rm app python evaluation/run_evaluation.py
