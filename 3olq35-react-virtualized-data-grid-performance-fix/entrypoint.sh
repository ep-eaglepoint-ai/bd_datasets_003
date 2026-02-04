#!/bin/sh
set -e
if [ "$REPO_PATH" = "repository_before" ]; then
  cd repository_before && npm install && npm test || true
elif [ "$REPO_PATH" = "repository_after" ]; then
  cd repository_after && npm install && npm test
else
  (cd repository_before && npm install)
  (cd repository_after && npm install)
  node evaluation/evaluate.mjs
fi
