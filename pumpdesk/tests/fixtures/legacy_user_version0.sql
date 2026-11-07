-- BasempumpBot old local schema, extracted from scratch copy (no rows)
PRAGMA user_version = 0;
-- journal_mode: wal

CREATE TABLE activity (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  ts TEXT, kind TEXT, mint TEXT, agent TEXT,
                  title TEXT, subtitle TEXT, value TEXT, meta TEXT
                );
CREATE TABLE audit_runs (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  mint TEXT, ts TEXT, passed INTEGER, layers_checked INTEGER,
                  holders INTEGER, reason TEXT, payload TEXT
                );
CREATE TABLE audits (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  mint TEXT, ts TEXT, layer INTEGER, name TEXT,
                  value_text TEXT, pass INTEGER, source TEXT
                );
CREATE TABLE balance (
                  ts TEXT, value REAL
                );
CREATE TABLE change_log (
                  ts TEXT, key TEXT, old TEXT, new TEXT, who TEXT
                );
CREATE TABLE coins (
                  mint TEXT PRIMARY KEY,
                  name TEXT,
                  symbol TEXT,
                  pool TEXT,
                  migrated_at TEXT,
                  creator TEXT,
                  creator_balance_at_migration REAL,
                  holders INTEGER,
                  night TEXT
                );
CREATE TABLE heartbeats (
                  agent TEXT PRIMARY KEY, ts TEXT
                );
CREATE TABLE nights (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  started_at TEXT, ended_at TEXT, mode TEXT, full INTEGER DEFAULT 0
                );
CREATE TABLE positions (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  mint TEXT, name TEXT, symbol TEXT,
                  opened_at TEXT, entry_price REAL, size_usd REAL,
                  peak_price REAL, stop_price REAL, stop_pct REAL,
                  trail_active INTEGER DEFAULT 0, trail_pct REAL,
                  closed_at TEXT, exit_price REAL, exit_reason TEXT,
                  pnl_usd REAL, fees_usd REAL, mode TEXT, status TEXT
                );
CREATE TABLE prices (
                  mint TEXT, ts TEXT, price REAL, volume_m5 REAL
                );
CREATE TABLE push_subs (
                  endpoint TEXT PRIMARY KEY, p256dh TEXT, auth TEXT, created_at TEXT
                );
CREATE TABLE rejected_mints (
                  mint TEXT, night TEXT, agent TEXT,
                  PRIMARY KEY (mint, night)
                );
CREATE TABLE runners (
                  mint TEXT, name TEXT, symbol TEXT, night TEXT, h24 REAL
                );
CREATE TABLE scans (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  mint TEXT, ts TEXT,
                  liquidity_usd REAL, top10_pct REAL, h1_change_pct REAL,
                  age_min INTEGER, verdict TEXT, reason TEXT,
                  name TEXT, symbol TEXT, pool TEXT
                );
CREATE TABLE settings (
                  key TEXT PRIMARY KEY, value TEXT, updated_at TEXT
                );
CREATE TABLE signals (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  mint TEXT, ts TEXT, price REAL, size_usd REAL, stack_pct REAL,
                  link TEXT, mode TEXT, status TEXT, reason TEXT, name TEXT, symbol TEXT
                );
CREATE TABLE skips (
                  mint TEXT PRIMARY KEY, until TEXT
                );
CREATE TABLE verdicts (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  mint TEXT, ts TEXT,
                  alive_6h REAL, organic REAL, flush REAL, chase REAL,
                  score INTEGER, pass INTEGER, reason TEXT, input_tokens INTEGER,
                  model TEXT, payload TEXT
                );
CREATE TABLE waiting_room (
                  mint TEXT PRIMARY KEY,
                  name TEXT, symbol TEXT, pool TEXT,
                  migrated_at TEXT, creator TEXT,
                  creator_balance REAL,
                  scanner_liq REAL, scanner_price REAL,
                  passed INTEGER DEFAULT 0,
                  killed INTEGER DEFAULT 0,
                  reason TEXT,
                  night TEXT
                );
CREATE INDEX idx_prices_mint_ts ON prices(mint, ts);
