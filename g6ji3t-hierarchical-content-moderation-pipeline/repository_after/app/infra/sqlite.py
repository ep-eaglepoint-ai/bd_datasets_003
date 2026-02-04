from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Optional

from app.core.config import AUDIT_DB_PATH


_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS moderation_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),

    content TEXT NOT NULL,

    final_verdict TEXT NOT NULL,

    static_verdict TEXT,
    static_score REAL,
    static_reason TEXT,
    static_latency_ms INTEGER,

    fuzzy_verdict TEXT,
    fuzzy_score REAL,
    fuzzy_reason TEXT,
    fuzzy_latency_ms INTEGER,

    ml_verdict TEXT,
    ml_score REAL,
    ml_reason TEXT,
    ml_latency_ms INTEGER
);
"""


def get_connection(db_path: Optional[Path] = None) -> sqlite3.Connection:
    path = Path(db_path or AUDIT_DB_PATH)
    path.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(str(path), check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    conn.execute(_SCHEMA_SQL)
    conn.commit()
