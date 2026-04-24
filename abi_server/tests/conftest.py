import csv
import sqlite3
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import main as main_module
from main import app

CSV_PATH = Path(__file__).parent / "evm.func_sign.csv"


@pytest.fixture(scope="session")
def db_path(tmp_path_factory):
    """Create a session-scoped SQLite DB populated from evm.func_sign.csv."""
    path = str(tmp_path_factory.mktemp("db") / "test.db")
    conn = sqlite3.connect(path)
    conn.execute("""
        CREATE TABLE func_signs (
            pkey      TEXT PRIMARY KEY,
            byte_sign TEXT NOT NULL,
            text_sign TEXT NOT NULL,
            abi       TEXT,
            score     INTEGER DEFAULT 0
        )
    """)
    conn.execute("CREATE INDEX idx_byte_sign ON func_signs (byte_sign)")
    with open(CSV_PATH, newline="") as f:
        rows = [
            (r["pkey"], r["byte_sign"], r["text_sign"], r["abi"], int(r["score"]))
            for r in csv.DictReader(f)
        ]
    conn.executemany("INSERT OR IGNORE INTO func_signs VALUES (?,?,?,?,?)", rows)
    conn.commit()
    conn.close()
    return path


@pytest.fixture(autouse=True)
def patch_db(db_path, monkeypatch):
    """Redirect main.DB_URL to SQLite for every test."""
    monkeypatch.setattr(main_module, "DB_URL", f"sqlite:///{db_path}")


@pytest.fixture
def client():
    return TestClient(app)
