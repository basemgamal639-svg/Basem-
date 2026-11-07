#!/bin/sh
# Prints whether a future install has the tools it needs. Does not install or start anything.
set -eu
missing=0
for cmd in python3 flock sqlite3; do
  if command -v "$cmd" >/dev/null 2>&1; then
    echo "present $cmd"
  else
    echo "missing $cmd"
    missing=1
  fi
done
echo "install-check does not start the desk and does not open port 8787"
exit "$missing"
