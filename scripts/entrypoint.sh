#!/usr/bin/env sh
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set" >&2
  exit 1
fi

python3 scripts/build_stats.py
echo "Ruins stats: build_stats.py completed successfully."
python3 scripts/server.py
