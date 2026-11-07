# Pump desk backend

Paper trading desk and simulated (non-executable) transaction previews. This directory is separate from the workshop site and from the published static shell at `/desk`.

Nothing in this tree is installed as a service, and nothing here connects a wallet or broadcasts a transaction. A passing test is not a statement that the process is running on a host.

## What this process is

One asyncio process (`main.py`) runs:

- Scanner, auditor, analyst, executor, and risk
- FastAPI
- At most one Telegram long poll, and only when `TG_TOKEN` is set and `Telegram.start()` is called by that process

PAPER still records a simulated fill at the signal price when a coin passes the executor. That fill is not a Solana transaction.

LIVE does not. A Telegram "Bought" tap does not open a position. The unverified live path is fail-closed.

A paper night is marked full only by the explicit operator command `complete night` (or `DB.complete_paper_night`). Process uptime and shutdown call `end_night`, which always leaves `full=0`.

Broadcast is the constant `BROADCAST_ENABLED = False` in `simpreview.py`. The UI cannot turn it on. Simulated previews are labeled `SIMULATED — NOT AN EXECUTABLE TRANSACTION`.

## Layout

| Path | Role |
| --- | --- |
| `main.py` | Process entry |
| `api.py` | HTTP routes |
| `config.py` | Defaults and validation |
| `db.py` | SQLite schema. The file stays outside git (`pumpdesk/data/`). |
| `agents/` | PAPER pipeline |
| `telegram.py` | Owner-locked commands. Does not adopt the first `/start`. |
| `health.py` | Read-only health document |
| `simpreview.py` | Preview, hash, ed25519 verify. No send path. |
| `rpc_allowlist.py` | RPC URL allowlist |
| `tools/probe.py` | Watchdog. Alerts are injected. |
| `tools/sim_preview_harness.py` | Offline preview print |
| `sim/preview.html` | Static explanation. No wallet, no cluster. |
| `deploy/` | Example unit and backup script. Not installed. |
| `.env.example` | Placeholders only |

The published Pages app under repository `desk/` is unchanged. Its `/api/...` calls are origin-absolute and do not reach this process. Run the UI from this process's origin, or change the client in a later change. Do not put `APP_TOKEN` in the Pages origin.

## Setup

Python 3.12. From the repository root:

```bash
python3 -m venv pumpdesk/.venv
pumpdesk/.venv/bin/pip install -r pumpdesk/requirements.txt
mkdir -p pumpdesk/.secrets
cp pumpdesk/.env.example pumpdesk/.secrets/env
# edit pumpdesk/.secrets/env locally. Do not commit it.
```

Defaults if the variables are unset:

| Variable | Default |
| --- | --- |
| `DESK_HOST` | `127.0.0.1` |
| `DESK_PORT` | `8787` |
| `APP_TOKEN` | empty, and every token-gated route returns 401 |
| `TG_TOKEN` | empty, Telegram does not start |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | empty, web push does not send |
| `VAPID_CONTACT` | `mailto:desk@localhost` |
| `DATA_PATH` | empty, Plan B writer stays off |
| `RPC_ALLOWLIST` | public mainnet RPC, public devnet RPC, `http://127.0.0.1:8899`, `http://localhost:8899` |
| `DESK_OWNER_CHAT_ID` | `0` (refuse every chat) |
| `DESK_PUMP_HANDLE` | empty |

`desk.rpc_url` starts at `https://api.mainnet-beta.solana.com` and can be changed only to a URL on the allowlist. Credentials in the URL, query strings, and link-local metadata hosts are rejected.

Start locally (this does not happen from the test suite):

```bash
set -a && source pumpdesk/.secrets/env && set +a
cd pumpdesk && .venv/bin/python main.py
```

Bind the process to loopback and put TLS on a reverse proxy. A runtime that sets `DESK_HOST=0.0.0.0` is outside this default. Do not publish port 8787 on the open internet.

## Commands

Telegram, and only from `desk.owner_chat_id` when that id is non-zero:

- `status`, `buy X`, `sell X`, `why X`
- `pause` / `resume` plus an agent name
- `set <name> to <value>`, `stack N`
- `paper`, and the exact text `LIVE` (still requires one explicitly completed PAPER night; LIVE still does not fill)
- `complete night` marks the current PAPER night full. Shutdown does not.
- `invite`, `report` (report text is still a stub)

If `desk.owner_chat_id` is 0, `/start` does not claim ownership.

## Routes

Legacy routes still accept `X-App-Token`, `Authorization: Bearer`, or `?t=` because the existing phone client uses a query token for Server-Sent Events. New routes refuse `?t=`.

| Method | Path | Auth | Effect |
| --- | --- | --- | --- |
| GET | `/health/live` | none | Process answered. No database write, no network. |
| GET | `/health/ready` | none | `SELECT 1` on the open database. 503 if that fails. |
| GET | `/health` | header token | Pipeline clocks, queue depth, poller state, disk. `trading_status=idle` when nothing has been ingested. A 200 here is not "healthy to trade". |
| GET | `/metrics` | header token | Counters and queue gauges. `broadcast_enabled` is 0. |
| POST | `/api/sim/preview` | header token | Frozen simulated preview and sha256. Header `Idempotency-Key` optional. |
| GET | `/api/sim/preview/{id}` | header token | Same preview, or 410 when expired. |
| POST | `/api/sim/preview/{id}/verify` | header token | ed25519 check of the frozen bytes. No broadcast. |
| POST | `/api/sim/stop` | header token | Refuses new previews and verification. |
| GET/POST | `/api/state`, `/api/chart`, `/api/activity`, `/api/coin/{mint}`, `/api/audit/{mint}`, `/api/agents/{name}/decisions`, `/api/account`, `/api/settings`, `/api/mode`, `/api/agents/{name}/pause`, `/api/agents/{name}/resume`, `/api/push`, `/api/stream`, `/api/test-push` | legacy token | Existing PAPER desk. |
| GET | `/d/` and `/d/{path}` | none | 404. Plan B files are not mounted. |

`/health/live` staying 200 while the scanner has seen no migration is expected. Read `trading_status`. `idle` means quiet. `stale` means a dependency clock is old. `ok` means a recent migration was stored and evaluation is not stuck.

## Preview fields

The canonical text starts with `SIMULATED — NOT AN EXECUTABLE TRANSACTION` and then includes intent id, cluster (`devnet` or `local` only), mint, name, symbol, decimals, side, `amount_base`, destination, `max_lamports_in`, `min_amount_out`, `slippage_bps` (0–500), `fee_lamports_ceiling`, and expiry (45 seconds). `message_sha256` is sha256 of that exact text. Changing any field changes the hash. Verification signs those bytes with an ed25519 key the caller holds. This repository never stores that private key.

Mainnet clusters are rejected. Lamports above `SIM_MAX_LAMPORTS` (1_000_000_000) are rejected. A second verify of the same preview is a replay. Reusing an idempotency key with a different body is a conflict.

## Tests

From `pumpdesk/`, with the venv activated and no Telegram token exported:

```bash
python -m unittest tests.test_health_and_sim
python tests/test_executor.py
python tests/test_gate.py
python tests/test_risk.py
python tests/test_links.py
python tests/test_secrets_grep.py
python tests/test_auditor_freeze.py
python tools/sim_preview_harness.py
```

These tests do not start `Telegram.start()`, do not call the network, and do not send messages. Signing uses an ephemeral in-memory key. That is cryptographic verification of the preview bytes. It is not a Phantom end-to-end test and it is not a devnet landing.

Optional later, by a person at a keyboard, not by CI: open the API inside Phantom's in-app browser on devnet and sign a non-value transaction with broadcast still off. Phantom's sign-only method is documented at <https://docs.phantom.com/solana/sending-a-transaction-1>. The browse deeplink is <https://docs.phantom.com/phantom-deeplinks/other-methods/browse>. Do not use PumpPortal Lightning, and do not paste a seed.

## Supervisor, probe, backups

`deploy/pumpdesk.service` is an example unit: one `ExecStart`, `Restart=on-failure`, `flock` so a second copy does not poll Telegram. It has not been installed.

`tools/probe.py` GETs `/health/live` and `/health/ready` through a client you pass in. The default tests use an in-memory alert list. Wire it to a sender only on a host you operate. Do not point it at Telegram from the test suite.

`deploy/backup-sqlite.sh` runs `sqlite3 .backup` when you invoke it. It is not scheduled. Restore by replacing `data/desk.db` while the process is stopped, then start one instance.

## HTTPS

Terminate TLS on a reverse proxy. Proxy `/` and `/api` and `/health` to `127.0.0.1:8787`. Keep Pages as static files only. Do not put the API token in Pages `localStorage`.

Wallet login (nonce, cookie session, CSRF) is not implemented. The header token remains the gate. Treat that as temporary and do not expose the port.

## Acceptance, and what is still open

Checked by the unit tests in this directory:

- LIVE handling does not insert a position
- PAPER handling still inserts a paper position
- Shutdown-style `end_night` does not mark a night full; an explicit complete does
- Empty owner id does not claim `/start`, and the poller client stays unset
- RPC URLs outside the allowlist are rejected
- Quiet database health is `idle`, live/ready do not write, detailed health and metrics require a header and reject `?t=`
- Bounded queue drop is counted
- Preview hash, idempotency, tamper, expiry, replay, cluster, limit, and stop behave as specified
- `simpreview.py` contains no `sendTransaction`
- Personal chat ids and the previous owner username are not in this tree

Not done, and not claimed:

- This process is not running, not supervised, and not backed up on any host
- No real Phantom signature, no devnet RPC round-trip, no `getTransaction` confirmation
- No mainnet broadcast path exists, and none should be added without a separate authorization
- Wallet-session auth, CSRF cookies, and a dedicated HTTPS deploy are future work
- The Pages `/desk` client still calls `/api` on the Pages origin
- Official Pump program instruction building is not wired; previews are structured messages, not serialized Solana transactions
