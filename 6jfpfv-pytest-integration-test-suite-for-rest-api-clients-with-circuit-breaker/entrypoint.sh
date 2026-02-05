#!/usr/bin/env bash
set -euo pipefail

cmd="${1:-evaluate}"

case "$cmd" in
  run-tests)
    exec python -m pytest -q repository_after
    ;;
  run-metatests)
    exec python -m pytest -q tests
    ;;
  evaluate|evaluation)
    exec python -m evaluation.evaluation
    ;;
  *)
    echo "Unknown command: $cmd" >&2
    echo "Expected: run-tests | run-metatests | evaluate" >&2
    exit 2
    ;;
esac
