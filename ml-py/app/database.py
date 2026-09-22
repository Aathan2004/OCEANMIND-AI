"""
SQLite persistence for users, sessions and identification history.

Deliberately dependency-light: the standard-library sqlite3 driver is enough for
this service and keeps the deployment story identical to the rest of ml-py.
"""
from __future__ import annotations

import os
import sqlite3
import threading
from pathlib import Path


def database_path() -> Path:
    base = Path(os.getenv("PROJECT_ROOT", str(Path(__file__).resolve().parent.parent)))
    return Path(os.getenv("DATABASE_PATH", str(base / "data" / "oceanmind.db")))


_local = threading.local()

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    email         TEXT    NOT NULL,
    password_hash TEXT    NOT NULL,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Emails are compared case-insensitively, so uniqueness must be too.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (lower(email));

-- JWTs are stateless, so logout has to revoke by token id.
CREATE TABLE IF NOT EXISTS revoked_tokens (
    jti        TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    revoked_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS identifications (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    status          TEXT    NOT NULL,
    scientific_name TEXT,
    common_name     TEXT,
    confidence      REAL,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_identifications_user
    ON identifications (user_id, created_at DESC);
"""


def get_connection() -> sqlite3.Connection:
    """One connection per thread; FastAPI runs sync endpoints in a threadpool."""
    connection = getattr(_local, "connection", None)
    if connection is None:
        path = database_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(str(path), check_same_thread=False)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        # WAL keeps reads from blocking behind the write that follows an upload.
        connection.execute("PRAGMA journal_mode = WAL")
        _local.connection = connection
    return connection


def init_database() -> None:
    connection = get_connection()
    connection.executescript(SCHEMA)
    connection.commit()


def purge_expired_tokens() -> int:
    """Revocation rows are only useful until the token would have expired anyway."""
    import time

    connection = get_connection()
    cursor = connection.execute("DELETE FROM revoked_tokens WHERE expires_at < ?", (int(time.time()),))
    connection.commit()
    return cursor.rowcount
