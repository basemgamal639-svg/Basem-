#!/usr/bin/env bash
# Package launcher. Do not point this at the original install.
# Refuses a public bind. One process via flock. Does not create a Plan B directory.
set -euo pipefail
cd "$(dirname "$0")"
if [[ -f .secrets/env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .secrets/env
  set +a
fi
host="${DESK_HOST:-127.0.0.1}"
case "$host" in
  0.0.0.0|::|"")
    echo "refusing bind $host" >&2
    exit 2
    ;;
esac
mkdir -p logs data
exec flock -n data/pumpdesk.lock .venv/bin/python main.py
