#!/bin/sh
# Example backup. Not scheduled and not run by this repository change.
# Usage: ./backup-sqlite.sh /var/lib/pumpdesk/desk.db /var/backups/pumpdesk
set -eu
src=${1:?database path}
dest_dir=${2:?backup directory}
mkdir -p "$dest_dir"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
dest="$dest_dir/desk-$stamp.db"
sqlite3 "$src" ".backup '$dest'"
echo "wrote $dest"
