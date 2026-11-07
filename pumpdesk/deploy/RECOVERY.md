# Recovery package

This file is the procedure. It was not executed against the original install, and it does not start a server.

Approval is required before any of these steps run on a machine that holds the real database.

## What this package is

- Python, FastAPI, asyncio, and SQLite.
- `BROADCAST_ENABLED` stays `False`. There is no send path.
- The owner is `DESK_OWNER_WALLET`, a public address. There is no shared bearer and no private key in the app.
- Opening a database runs the additive schema migration and quarantines unsafe settings. Historical values are copied to `settings_quarantine` before the active row is replaced.

## Before anything else

1. Do not point this tree at `/home/box/workspace/pump-desk` or at `/workspace/basempump-backups/20261106-232116/`.
2. Copy the database file, its `-wal`, and its `-shm` to a new directory.
3. Run the checks below on that copy.

```bash
python3 - "$COPY" << 'PY'
import sqlite3, sys
path = sys.argv[1]
con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
print("integrity", con.execute("PRAGMA integrity_check").fetchone()[0])
print("user_version", con.execute("PRAGMA user_version").fetchone()[0])
print("rows", con.execute("SELECT COUNT(*) FROM scans").fetchone()[0],
      con.execute("SELECT COUNT(*) FROM positions").fetchone()[0],
      con.execute("SELECT COUNT(*) FROM signals").fetchone()[0],
      con.execute("SELECT COUNT(*) FROM settings").fetchone()[0])
con.close()
PY
```

Pass the copy path as the argument. Stop if integrity is not `ok`.

## Backup and restore

Online backup of a copy, not the original:

```bash
python3 pumpdesk/deploy/backup_sqlite.py /path/to/copy.db /path/to/backup.db
```

Restore is a file copy of `backup.db` over the copy, with the process stopped, then deleting leftover `-wal` and `-shm` for that copy. Open the restored file read-only and repeat the integrity check before starting anything.

Rollback of a migration is the same file restore. Quarantine does not delete the historical values, but restoring the pre-migration file is the way back to the previous schema. Do not restore by copying quarantined values back into `settings` unless a person has reviewed each row. Unsafe mode, owner, RPC, bind, and broadcast values are not applied automatically.

## Config preflight

- `DESK_HOST` must be a loopback address. `0.0.0.0`, `::`, and an empty host make the process exit.
- `pumpdesk/.secrets` must be mode `0700` if it exists. The process exits when group or other bits are set. This package does not chmod the original directory.
- `DESK_OWNER_WALLET` is the public owner address. Leave it empty to refuse login.
- `TG_TOKEN` stays out of git. `NOTIFY_DELIVER=0` in the example keeps Telegram delivery off until a person sets it.
- `BROADCAST_ENABLED` is not a setting.

```bash
python3 -c 'from preflight import bind_rejected, secrets_dir_rejected; import sys; from pathlib import Path; sys.exit(1 if bind_rejected(sys.argv[1]) or secrets_dir_rejected(Path(sys.argv[2])) else 0)' 127.0.0.1 /path/to/copy/.secrets
```

## One process

`pumpdesk/start.sh` refuses a public bind and takes `flock` on `data/pumpdesk.lock`. Run it only from a disposable copy, after approval:

```bash
DESK_HOST=127.0.0.1 DESK_PORT=8787 DESK_OWNER_WALLET='<public address>' ./start.sh
```

`deploy/pumpdesk.service` is an example unit for one process. Do not install it during this recovery step.

## Health, logs, and TLS

- Liveness: `GET /health/live` returns `{"status":"live"}` when the process answers.
- Readiness: `GET /health/ready` runs `SELECT 1`.
- Detail and metrics require an owner session. A 200 from liveness is not a trading clearance.
- Logs go to `pumpdesk/logs/`. They must not contain tokens.
- `deploy/Caddyfile.example` is an HTTPS reverse proxy in front of `127.0.0.1`. Do not publish port 8787.

## Staged release

1. Tests on a disposable database pass, including quarantine and rollback.
2. A person approves the public owner wallet and the loopback bind.
3. Start one process against the database copy.
4. Confirm liveness on loopback and confirm `broadcast_enabled` is false.
5. Only then replace the approved copy's service. The original install is not part of this package.

## Rollback gate

Stop the new process. Restore the backup files taken before the migration. Confirm integrity. Do not start the original tree from this package. Do not delete `settings_quarantine` from a database you still need to review.
