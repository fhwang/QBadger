#!/usr/bin/env bash
set -euo pipefail

SUPPRESSIONS_FILE="eslint-suppressions.json"
MAX_SUPPRESSIONS=12

if [ ! -f "$SUPPRESSIONS_FILE" ]; then
  echo "No suppressions file found — all clean."
  exit 0
fi

total=$(node -e "
  const data = require('./$SUPPRESSIONS_FILE');
  let total = 0;
  for (const file of Object.values(data)) {
    for (const rule of Object.values(file)) {
      total += rule.count;
    }
  }
  console.log(total);
")

echo "ESLint suppressions: $total (max: $MAX_SUPPRESSIONS)"

if [ "$total" -gt "$MAX_SUPPRESSIONS" ]; then
  echo "FAIL: Suppression count increased. Fix the violations instead of suppressing them."
  exit 1
fi
