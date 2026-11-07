"""SQLite backup using the backup API. Not scheduled. Does not touch a live parent DB."""
from __future__ import annotations

import sqlite3
from pathlib import Path


def backup_file(source: Path, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    src = sqlite3.connect(source)
    dst = sqlite3.connect(dest)
    try:
        src.backup(dst)
    finally:
        dst.close()
        src.close()


def restore_check(backup: Path, table: str, key_column: str, key_value: str) -> bool:
    con = sqlite3.connect(backup)
    try:
        row = con.execute(
            f"SELECT 1 FROM {table} WHERE {key_column}=?",
            (key_value,),
        ).fetchone()
        integrity = con.execute("PRAGMA integrity_check").fetchone()
    finally:
        con.close()
    return bool(row) and integrity is not None and integrity[0] == "ok"
