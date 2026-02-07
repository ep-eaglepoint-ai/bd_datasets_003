#!/usr/bin/env bash
# Generate a clean diff patch between repository_before and repository_after.
# Excludes build artifacts, node_modules, .env, etc. (see scripts/diff.exclude).
# Run from project root (WSL):  bash scripts/wsl-diff.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
EXCLUDE_FILE="$SCRIPT_DIR/diff.exclude"
PATCH_FILE="$ROOT/patches/diff.patch"

cd "$ROOT" || exit 1

if [[ ! -f "$EXCLUDE_FILE" ]]; then
  echo "Missing $EXCLUDE_FILE"
  exit 1
fi

# Temp dirs for filtered trees (so patch only includes necessary files)
BEFORE_TMP=$(mktemp -d)
AFTER_TMP=$(mktemp -d)
trap 'rm -rf "$BEFORE_TMP" "$AFTER_TMP"' EXIT

# Copy trees excluding unwanted paths; strip comments, blank lines, and CRLF from exclude file
EXCLUDE_ARGS=()
while IFS= read -r line || [[ -n "$line" ]]; do
  line=$(printf '%s' "$line" | sed 's/\r$//; s/#.*//; s/^[[:space:]]*//; s/[[:space:]]*$//')
  [[ -z "$line" ]] && continue
  EXCLUDE_ARGS+=(--exclude "$line")
done < "$EXCLUDE_FILE"

# If no patterns, rsync still works (no excludes)
rsync -a "${EXCLUDE_ARGS[@]}" "repository_before/" "$BEFORE_TMP/"
rsync -a "${EXCLUDE_ARGS[@]}" "repository_after/" "$AFTER_TMP/"

# Generate diff; diff -rNu returns 1 when files differ (normal)
# Use Python for path replacement (avoids perl/sed escaping issues)
set +e
export BEFORE_TMP AFTER_TMP
diff -rNu "$BEFORE_TMP" "$AFTER_TMP" | python3 -c '
import sys, os
b, a = os.environ["BEFORE_TMP"], os.environ["AFTER_TMP"]
for line in sys.stdin:
    sys.stdout.write(line.replace(b, "repository_before").replace(a, "repository_after"))
' > "$PATCH_FILE"
diff_ret=$?
set -e
[[ $diff_ret -eq 0 || $diff_ret -eq 1 ]] || { echo "diff failed (exit $diff_ret)"; exit 1; }

# Warn if patch is empty or tiny
if [[ ! -s "$PATCH_FILE" ]]; then
  echo "WARNING: Patch file is empty. Check that repository_before and repository_after differ."
  exit 1
fi

echo "Done. Clean patch written to patches/diff.patch ($(wc -l < "$PATCH_FILE") lines)"
echo "Excluded paths are listed in scripts/diff.exclude"
