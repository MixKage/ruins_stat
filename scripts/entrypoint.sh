#!/usr/bin/env sh
set -eu

DB_PATH="${DB_PATH:-/data/ruins.db}"
export DB_PATH

python3 scripts/build_stats.py
python3 scripts/server.py
