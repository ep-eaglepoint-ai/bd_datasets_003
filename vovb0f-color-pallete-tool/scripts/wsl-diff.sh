#!/usr/bin/env bash
# Faster than git diff --no-index. Run from project root:  bash scripts/wsl-diff.sh
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.." || exit 1
diff -rNu repository_before/ repository_after/ > patches/diff.patch
echo "Done. See patches/diff.patch"
