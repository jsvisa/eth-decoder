# abi_server Testing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pytest test suite for the abi_server FastAPI service, backed by a SQLite DB loaded from `evm.func_sign.csv`, covering all four API endpoints and key pure functions.

**Architecture:** Refactor `main.py` to support SQLite alongside Postgres (URL-based detection, Python-side indexed filtering). A session-scoped pytest fixture populates an in-memory SQLite DB from the CSV. Tests use FastAPI's `TestClient` against the live app with the DB patched to SQLite.

**Tech Stack:** pytest 8, httpx, FastAPI TestClient, sqlite3 (stdlib), evm.func_sign.csv (10,000 rows)

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Modify | `abi_server/pyproject.toml` | Add pytest + httpx as test deps |
| Modify | `abi_server/main.py:1` | Add `import json` |
| Modify | `abi_server/main.py:21` | Add `_param()`, `_table()`, `_parse_abi()` helpers after `APIKEY` |
| Modify | `abi_server/main.py:46-49` | Update `get_db_connection()` for SQLite |
| Modify | `abi_server/main.py:51-65` | Update `get_abi_by_sign()` — use helpers, normalize ABI |
| Modify | `abi_server/main.py:174-212` | Replace `get_event_abi_by_topic()` — plain SQL + Python filter |
| Create | `abi_server/tests/__init__.py` | Empty, marks directory as package |
| Create | `abi_server/tests/conftest.py` | Session-scoped SQLite fixture from CSV; patches `main.DB_URL` |
| Create | `abi_server/tests/test_main.py` | All tests |

---

### Task 1: Add test dependencies

**Files:**
- Modify: `abi_server/pyproject.toml`

- [ ] **Step 1: Add optional test dependencies**

Replace the contents of `abi_server/pyproject.toml` with:

```toml
[build-system]
requires = ["setuptools"]
build-backend = "setuptools.build_meta"

[project]
name = "abi-server"
version = "0.1.0"
requires-python = ">=3.11"

[project.optional-dependencies]
test = ["pytest>=8", "httpx>=0.27"]

[project.scripts]
abi-server = "main:main"

[tool.setuptools]
py-modules = ["main"]
```

- [ ] **Step 2: Install with test extras**

```bash
cd /Users/wenbiao.zheng/bc/decoder/abi_server
pip install -e ".[test]"
```

Expected: no errors. `pytest --version` prints a version line.

- [ ] **Step 3: Commit**

```bash
git add abi_server/pyproject.toml
git commit -m "chore(abi-server): add pytest and httpx test dependencies"
```

---

### Task 2: Create test directory and conftest.py

**Files:**
- Create: `abi_server/tests/__init__.py`
- Create: `abi_server/tests/conftest.py`

- [ ] **Step 1: Create the tests package**

```bash
mkdir -p /Users/wenbiao.zheng/bc/decoder/abi_server/tests
touch /Users/wenbiao.zheng/bc/decoder/abi_server/tests/__init__.py
```

- [ ] **Step 2: Write conftest.py**

Create `abi_server/tests/conftest.py`:

```python
import csv
import sqlite3
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import main as main_module
from main import app

# evm.func_sign.csv lives at the repo root (two levels above abi_server/tests/)
CSV_PATH = Path(__file__).parent.parent.parent / "evm.func_sign.csv"


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
```

- [ ] **Step 3: Verify pytest collects with no errors (no tests yet)**

```bash
cd /Users/wenbiao.zheng/bc/decoder/abi_server
pytest tests/ -v
```

Expected:
```
collected 0 items
no tests ran
```
Exit code 0. If there are import errors, fix them before continuing.

- [ ] **Step 4: Commit**

```bash
git add abi_server/tests/
git commit -m "test(abi-server): add test directory and SQLite conftest"
```

---

### Task 3: Refactor main.py for SQLite support

**Files:**
- Modify: `abi_server/main.py`

This is the TDD task: write one test that uses SQLite, watch it fail, then implement the refactoring.

- [ ] **Step 1: Write a failing test for SQLite connectivity**

Create `abi_server/tests/test_main.py` with just this one test:

```python
import main as main_module


def test_get_db_connection_uses_sqlite(db_path):
    """get_db_connection() should return a sqlite3 connection when DB_URL is sqlite:///."""
    import sqlite3
    conn = main_module.get_db_connection()
    assert isinstance(conn, sqlite3.Connection)
    conn.close()
```

- [ ] **Step 2: Run and confirm it fails**

```bash
cd /Users/wenbiao.zheng/bc/decoder/abi_server
pytest tests/test_main.py::test_get_db_connection_uses_sqlite -v
```

Expected: FAIL — `get_db_connection` calls `psycopg2.connect` which fails against a sqlite:/// URL.

- [ ] **Step 3: Add `import json` to main.py imports**

In `abi_server/main.py`, find the import block at the top and add `import json`:

```python
import json
import os
import logging
import uvicorn
import psycopg2
from typing import List, Dict
from eth_utils.abi import collapse_if_tuple
from multicall.eth_decode import eth_decode_input, eth_decode_log_as_dict
from fastapi import FastAPI, HTTPException, Query
```

- [ ] **Step 4: Add three helpers after the APIKEY line**

In `abi_server/main.py`, find this block (around line 20):

```python
DB_URL = os.getenv("POSTGRES_DATABASE_URL")
APIKEY = os.getenv("ABI_SERVER_APIKEY", ")")
```

Add the helpers immediately after:

```python
DB_URL = os.getenv("POSTGRES_DATABASE_URL")
APIKEY = os.getenv("ABI_SERVER_APIKEY", ")")


def _param():
    """SQL parameter placeholder: ? for SQLite, %s for Postgres."""
    return "?" if (DB_URL and DB_URL.startswith("sqlite:///")) else "%s"


def _table():
    """Table name without schema prefix for SQLite."""
    return "func_signs" if (DB_URL and DB_URL.startswith("sqlite:///")) else "evm.func_signs"


def _parse_abi(val):
    """Normalize ABI field: sqlite3 returns TEXT strings, psycopg2 JSONB returns dicts."""
    if isinstance(val, str):
        return json.loads(val)
    return val
```

- [ ] **Step 5: Update `get_db_connection()`**

Find the existing `get_db_connection` function (around line 46):

```python
def get_db_connection():
    conn = psycopg2.connect(DB_URL)
    return conn
```

Replace it with:

```python
def get_db_connection():
    if DB_URL and DB_URL.startswith("sqlite:///"):
        import sqlite3
        return sqlite3.connect(DB_URL[len("sqlite:///"):])
    return psycopg2.connect(DB_URL)
```

- [ ] **Step 6: Run the test and confirm it passes**

```bash
cd /Users/wenbiao.zheng/bc/decoder/abi_server
pytest tests/test_main.py::test_get_db_connection_uses_sqlite -v
```

Expected: PASS.

- [ ] **Step 7: Update `get_abi_by_sign()` to use helpers and normalize ABI**

Find the existing `get_abi_by_sign` function (around line 51):

```python
def get_abi_by_sign(sign, count=1):
    if count > 10:
        count = 10
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        "SELECT text_sign, abi FROM evm.func_signs "
        "WHERE byte_sign = %s ORDER BY score DESC LIMIT %s",
        (sign, count),
    )
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return rows
```

Replace it with:

```python
def get_abi_by_sign(sign, count=1):
    if count > 10:
        count = 10
    p = _param()
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        f"SELECT text_sign, abi FROM {_table()} "
        f"WHERE byte_sign = {p} ORDER BY score DESC LIMIT {p}",
        (sign, count),
    )
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return [(row[0], _parse_abi(row[1])) for row in rows]
```

- [ ] **Step 8: Replace `get_event_abi_by_topic()` — remove JSONB query, filter in Python**

Find the existing `get_event_abi_by_topic` function (around line 174). It has two separate `cur.execute` branches (one with JSONB, one without). Replace the entire function with:

```python
def get_event_abi_by_topic(topic0: str, count: int = 1, num_indexed: int | None = None):
    """Look up event ABI by topic0 hash.

    Fetches up to 50 candidates from the DB, then filters by indexed field
    count in Python (removes the Postgres-specific JSONB dependency).
    """
    if count > 10:
        count = 10
    p = _param()
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        f"SELECT text_sign, abi FROM {_table()} "
        f"WHERE byte_sign = {p} ORDER BY score DESC LIMIT {p}",
        (topic0.lower(), 50),
    )
    rows = cur.fetchall()
    cur.close()
    conn.close()

    rows = [(row[0], _parse_abi(row[1])) for row in rows]

    if num_indexed is not None:
        rows = [
            row for row in rows
            if row[1] and sum(
                1 for inp in row[1].get("inputs", []) if inp.get("indexed")
            ) == num_indexed
        ]

    return rows[:count]
```

- [ ] **Step 9: Run all tests to confirm nothing broke**

```bash
cd /Users/wenbiao.zheng/bc/decoder/abi_server
pytest tests/ -v
```

Expected: 1 test passes, no failures.

- [ ] **Step 10: Commit**

```bash
git add abi_server/main.py
git commit -m "refactor(abi-server): add SQLite support and Python-side indexed filtering"
```

---

### Task 4: Unit tests for pure functions

**Files:**
- Modify: `abi_server/tests/test_main.py`

The pure functions already exist. These tests verify their behavior and serve as a regression net.

- [ ] **Step 1: Add unit tests to test_main.py**

Append to `abi_server/tests/test_main.py`:

```python
import json

from main import (
    decode_event_log,
    extract_output_sign,
    is_valid_hex_data,
    serialize_value,
)

# ---------------------------------------------------------------------------
# is_valid_hex_data
# ---------------------------------------------------------------------------

def test_is_valid_hex_data_with_prefix():
    assert is_valid_hex_data("0x1234abcd") is True


def test_is_valid_hex_data_without_prefix():
    assert is_valid_hex_data("1234abcd") is True


def test_is_valid_hex_data_invalid_chars():
    assert is_valid_hex_data("0xzzzzzzzz") is False


def test_is_valid_hex_data_empty():
    assert is_valid_hex_data("") is False


# ---------------------------------------------------------------------------
# extract_output_sign
# ---------------------------------------------------------------------------

def test_extract_output_sign_simple():
    abi = {"outputs": [{"name": "", "type": "uint256"}]}
    assert extract_output_sign(abi) == "(uint256)"


def test_extract_output_sign_tuple():
    abi = {
        "outputs": [
            {
                "name": "",
                "type": "tuple",
                "components": [
                    {"name": "a", "type": "uint128"},
                    {"name": "b", "type": "bool"},
                ],
            }
        ]
    }
    assert extract_output_sign(abi) == "((uint128,bool))"


# ---------------------------------------------------------------------------
# serialize_value
# ---------------------------------------------------------------------------

def test_serialize_value_int_becomes_string():
    assert serialize_value(123) == "123"


def test_serialize_value_nested_list():
    assert serialize_value([1, [2, 3]]) == ["1", ["2", "3"]]


def test_serialize_value_dict():
    assert serialize_value({"a": 5, "b": 0}) == {"a": "5", "b": "0"}


def test_serialize_value_string_passthrough():
    assert serialize_value("hello") == "hello"


# ---------------------------------------------------------------------------
# decode_event_log  (Transfer event from evm.func_sign.csv)
# ---------------------------------------------------------------------------

# Transfer(address fromAddress, address toAddress, uint256 value)
# topic0 = keccak256("Transfer(address,address,uint256)")
TRANSFER_ABI = {
    "name": "Transfer",
    "type": "event",
    "inputs": [
        {"name": "fromAddress", "type": "address", "indexed": True},
        {"name": "toAddress", "type": "address", "indexed": True},
        {"name": "value", "type": "uint256", "indexed": False},
    ],
    "anonymous": False,
}

TRANSFER_TOPIC0 = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
# from = USDC contract (just a recognisable address)
TRANSFER_TOPIC1 = "0x000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
# to = WETH contract
TRANSFER_TOPIC2 = "0x000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"
# value = 1_000_000 (0xF4240)
TRANSFER_DATA = "0x00000000000000000000000000000000000000000000000000000000000f4240"


def test_decode_event_log_returns_event_name():
    result = decode_event_log(
        TRANSFER_ABI,
        [TRANSFER_TOPIC0, TRANSFER_TOPIC1, TRANSFER_TOPIC2],
        TRANSFER_DATA,
    )
    assert result["event"] == "Transfer"


def test_decode_event_log_decodes_value_as_string():
    result = decode_event_log(
        TRANSFER_ABI,
        [TRANSFER_TOPIC0, TRANSFER_TOPIC1, TRANSFER_TOPIC2],
        TRANSFER_DATA,
    )
    assert result["args"]["value"] == "1000000"


def test_decode_event_log_decodes_indexed_address():
    result = decode_event_log(
        TRANSFER_ABI,
        [TRANSFER_TOPIC0, TRANSFER_TOPIC1, TRANSFER_TOPIC2],
        TRANSFER_DATA,
    )
    assert result["args"]["fromAddress"].lower() == "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
```

- [ ] **Step 2: Run and verify all pass**

```bash
cd /Users/wenbiao.zheng/bc/decoder/abi_server
pytest tests/test_main.py -v -k "not api"
```

Expected: 14 tests, all passing.

- [ ] **Step 3: Commit**

```bash
git add abi_server/tests/test_main.py
git commit -m "test(abi-server): add unit tests for pure functions"
```

---

### Task 5: API tests — /api/v1/query and /api/v1/query-event

**Files:**
- Modify: `abi_server/tests/test_main.py`

The default `APIKEY` in main.py is `")"` (`os.getenv("ABI_SERVER_APIKEY", ")")`). Tests pass `apikey=")"` for authorized requests. The test client handles URL encoding automatically via `params=`.

Known rows from evm.func_sign.csv:
- `0xb82e16e3` → `getAdapters()` (function)
- `0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef` → `Transfer(address,address,uint256)` (event)

- [ ] **Step 1: Append query endpoint tests to test_main.py**

```python
# ---------------------------------------------------------------------------
# GET /api/v1/query
# ---------------------------------------------------------------------------

VALID_APIKEY = ")"  # default value of APIKEY in main.py
GETADAPTERS_SIGN = "0xb82e16e3"


def test_query_wrong_apikey_returns_401(client):
    resp = client.get("/api/v1/query", params={"apikey": "wrong", "sign": GETADAPTERS_SIGN})
    assert resp.status_code == 401


def test_query_known_sign_returns_text_sign(client):
    resp = client.get("/api/v1/query", params={"apikey": VALID_APIKEY, "sign": GETADAPTERS_SIGN})
    assert resp.status_code == 200
    body = resp.json()
    assert body["msg"] == "ok"
    assert body["data"]["text_sign"] == "getAdapters()"


def test_query_known_sign_returns_abi(client):
    resp = client.get("/api/v1/query", params={"apikey": VALID_APIKEY, "sign": GETADAPTERS_SIGN})
    body = resp.json()
    assert body["data"]["abi"] is not None
    assert body["data"]["abi"]["name"] == "getAdapters"


def test_query_unknown_sign_returns_not_found(client):
    resp = client.get("/api/v1/query", params={"apikey": VALID_APIKEY, "sign": "0xdeadbeef"})
    assert resp.status_code == 200
    assert resp.json()["msg"] == "not found"


# ---------------------------------------------------------------------------
# GET /api/v1/query-event
# ---------------------------------------------------------------------------

TRANSFER_TOPIC0 = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"


def test_query_event_wrong_apikey_returns_401(client):
    resp = client.get("/api/v1/query-event", params={"apikey": "wrong", "sign": TRANSFER_TOPIC0})
    assert resp.status_code == 401


def test_query_event_missing_sign_returns_400(client):
    resp = client.get("/api/v1/query-event", params={"apikey": VALID_APIKEY})
    assert resp.status_code == 400


def test_query_event_known_transfer_sign_returns_text_sign(client):
    resp = client.get(
        "/api/v1/query-event", params={"apikey": VALID_APIKEY, "sign": TRANSFER_TOPIC0}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["msg"] == "ok"
    assert body["data"]["text_sign"] == "Transfer(address,address,uint256)"
```

Note: `TRANSFER_TOPIC0` is defined again here for readability since this section may be read independently. The constant will be deduplicated during implementation — define it once near the top of the test file and reference it throughout.

- [ ] **Step 2: Run and verify all pass**

```bash
cd /Users/wenbiao.zheng/bc/decoder/abi_server
pytest tests/test_main.py -v -k "query"
```

Expected: 7 tests, all passing.

- [ ] **Step 3: Commit**

```bash
git add abi_server/tests/test_main.py
git commit -m "test(abi-server): add /api/v1/query and /api/v1/query-event tests"
```

---

### Task 6: API tests — /api/v1/decode

**Files:**
- Modify: `abi_server/tests/test_main.py`

`getAdapters()` (sign `0xb82e16e3`) has no inputs, so calldata is just the 4-byte selector. `eth_decode_input` handles empty-input functions by returning `("getAdapters", {})`.

- [ ] **Step 1: Append decode endpoint tests to test_main.py**

```python
# ---------------------------------------------------------------------------
# GET /api/v1/decode
# ---------------------------------------------------------------------------


def test_decode_too_short_returns_400(client):
    resp = client.get("/api/v1/decode", params={"data": "0x1234"})
    assert resp.status_code == 400


def test_decode_invalid_hex_returns_400(client):
    resp = client.get("/api/v1/decode", params={"data": "0xzzzzzzzz"})
    assert resp.status_code == 400


def test_decode_unknown_sign_returns_error_msg(client):
    resp = client.get("/api/v1/decode", params={"data": "0xdeadbeef"})
    assert resp.status_code == 200
    assert resp.json()["msg"] == "error"


def test_decode_known_no_input_function_returns_ok(client):
    # getAdapters() has no inputs — calldata is just the 4-byte selector
    resp = client.get("/api/v1/decode", params={"data": "0xb82e16e3"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["msg"] == "ok"
    assert body["data"][0]["func"] == "getAdapters"


def test_decode_with_sign_flag_includes_sign_field(client):
    resp = client.get("/api/v1/decode", params={"data": "0xb82e16e3", "with_sign": "true"})
    assert resp.status_code == 200
    assert resp.json()["data"][0]["sign"] == "0xb82e16e3"


def test_decode_with_abi_flag_includes_abi_field(client):
    resp = client.get("/api/v1/decode", params={"data": "0xb82e16e3", "with_abi": "true"})
    assert resp.status_code == 200
    result = resp.json()["data"][0]
    assert result["abi"] is not None
    assert result["abi"]["name"] == "getAdapters"
```

- [ ] **Step 2: Run and verify all pass**

```bash
cd /Users/wenbiao.zheng/bc/decoder/abi_server
pytest tests/test_main.py -v -k "decode and not event"
```

Expected: 6 tests, all passing.

- [ ] **Step 3: Commit**

```bash
git add abi_server/tests/test_main.py
git commit -m "test(abi-server): add /api/v1/decode tests"
```

---

### Task 7: API tests — /api/v1/decode-event

**Files:**
- Modify: `abi_server/tests/test_main.py`

Test two events from the CSV that have different indexed counts:

**Transfer** — `0xddf252ad...` — 2 indexed (`fromAddress`, `toAddress`), 1 data (`value`)
**Approval** — `0x8c5be1e5...` — 2 indexed (`_owner`, `_approved`), 1 data (`_tokenId`)

For the API, `topics` is a comma-separated query param. The route splits on commas and uses `len(topics) - 1` as `num_indexed`.

```
Transfer topics: topic0, padded_from, padded_to   → num_indexed = 2
Approval topics: topic0, padded_owner, padded_approved → num_indexed = 2
```

- [ ] **Step 1: Append decode-event tests to test_main.py**

```python
# ---------------------------------------------------------------------------
# GET /api/v1/decode-event
# ---------------------------------------------------------------------------

APPROVAL_TOPIC0 = "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925"
# Reuse addresses from Transfer fixtures as owner/approved for Approval test
_ADDR1_PADDED = "0x000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
_ADDR2_PADDED = "0x000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"
# value = 1_000_000, tokenId = 42 (0x2a)
_VALUE_DATA = "0x00000000000000000000000000000000000000000000000000000000000f4240"
_TOKENID_DATA = "0x000000000000000000000000000000000000000000000000000000000000002a"


def test_decode_event_missing_sign_returns_400(client):
    resp = client.get("/api/v1/decode-event")
    assert resp.status_code == 400


def test_decode_event_unknown_sign_returns_not_found(client):
    resp = client.get("/api/v1/decode-event", params={"sign": "0xdeadbeef" + "00" * 28})
    assert resp.status_code == 200
    assert resp.json()["msg"] == "not found"


def test_decode_event_transfer_returns_event_name(client):
    topics = f"{TRANSFER_TOPIC0},{_ADDR1_PADDED},{_ADDR2_PADDED}"
    resp = client.get(
        "/api/v1/decode-event",
        params={"sign": TRANSFER_TOPIC0, "topics": topics, "data": _VALUE_DATA},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["msg"] == "ok"
    assert body["data"]["event"] == "Transfer"


def test_decode_event_transfer_decodes_value(client):
    topics = f"{TRANSFER_TOPIC0},{_ADDR1_PADDED},{_ADDR2_PADDED}"
    resp = client.get(
        "/api/v1/decode-event",
        params={"sign": TRANSFER_TOPIC0, "topics": topics, "data": _VALUE_DATA},
    )
    assert resp.json()["data"]["args"]["value"] == "1000000"


def test_decode_event_transfer_includes_abi_inputs(client):
    topics = f"{TRANSFER_TOPIC0},{_ADDR1_PADDED},{_ADDR2_PADDED}"
    resp = client.get(
        "/api/v1/decode-event",
        params={"sign": TRANSFER_TOPIC0, "topics": topics, "data": _VALUE_DATA},
    )
    inputs = resp.json()["data"]["inputs"]
    assert any(inp["name"] == "value" for inp in inputs)


def test_decode_event_approval_decodes_token_id(client):
    topics = f"{APPROVAL_TOPIC0},{_ADDR1_PADDED},{_ADDR2_PADDED}"
    resp = client.get(
        "/api/v1/decode-event",
        params={"sign": APPROVAL_TOPIC0, "topics": topics, "data": _TOKENID_DATA},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["msg"] == "ok"
    assert body["data"]["event"] == "Approval"
    assert body["data"]["args"]["_tokenId"] == "42"


def test_decode_event_indexed_filtering_selects_correct_abi(client):
    """When sign matches multiple ABIs with different indexed counts,
    the one matching the actual topic count must be selected."""
    # Transfer has 2 indexed; passing only 1 extra topic (num_indexed=1) should return not found
    # because there is no Transfer-like ABI with exactly 1 indexed field for this topic0
    topics_one_indexed = f"{TRANSFER_TOPIC0},{_ADDR1_PADDED}"
    resp = client.get(
        "/api/v1/decode-event",
        params={"sign": TRANSFER_TOPIC0, "topics": topics_one_indexed, "data": _VALUE_DATA},
    )
    # Either not found or error — must NOT decode as Transfer (which has 2 indexed)
    body = resp.json()
    assert body["msg"] in ("not found", "error")
```

- [ ] **Step 2: Run and verify all pass**

```bash
cd /Users/wenbiao.zheng/bc/decoder/abi_server
pytest tests/test_main.py -v -k "decode_event"
```

Expected: 7 tests, all passing.

- [ ] **Step 3: Run the full suite**

```bash
cd /Users/wenbiao.zheng/bc/decoder/abi_server
pytest tests/ -v
```

Expected: all 35 tests passing.

- [ ] **Step 4: Commit**

```bash
git add abi_server/tests/test_main.py
git commit -m "test(abi-server): add /api/v1/decode-event tests"
```

---

### Task 8: Add abi_server test job to GitHub Actions CI

**Files:**
- Modify: `.github/workflows/ci.yml`

Add a new blocking job `test-abi-server` that runs before the existing `test` job can be considered the full CI gate. The job installs Python, installs test deps, and runs pytest.

- [ ] **Step 1: Add the job to ci.yml**

Open `.github/workflows/ci.yml`. After the closing `---` separator or after the last job block, add the following job (at the same indentation level as `test` and `e2e`):

```yaml
  test-abi-server:
    name: abi_server Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"

      - name: Install abi_server with test deps
        run: pip install -e ".[test]"
        working-directory: abi_server

      - name: Run abi_server tests
        run: pytest tests/ -v
        working-directory: abi_server
```

- [ ] **Step 2: Verify the YAML is valid**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo "valid"
```

Expected: `valid`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add abi_server pytest job to GitHub Actions"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|-----------------|------|
| SQLite support in get_db_connection | Task 3, Step 5 |
| _param(), _table(), _parse_abi() helpers | Task 3, Step 4 |
| get_abi_by_sign uses helpers + normalizes ABI | Task 3, Step 7 |
| get_event_abi_by_topic: plain SQL + Python filter, fetch 50 | Task 3, Step 8 |
| conftest.py loads evm.func_sign.csv into SQLite | Task 2, Step 2 |
| Unit: is_valid_hex_data | Task 4 |
| Unit: extract_output_sign (simple + tuple) | Task 4 |
| Unit: serialize_value (int, nested list, dict, passthrough) | Task 4 |
| Unit: decode_event_log (event name, value, address) | Task 4 |
| API: /api/v1/query — 401, ok, not found | Task 5 |
| API: /api/v1/query-event — 401, 400, ok | Task 5 |
| API: /api/v1/decode — 400, error, ok, with_sign, with_abi | Task 6 |
| API: /api/v1/decode-event — 400, not found, Transfer, Approval, indexed filter | Task 7 |
| CI job | Task 8 |
| pytest + httpx deps in pyproject.toml | Task 1 |

All spec requirements are covered. No placeholders or TBDs found.

**Type consistency check:** `TRANSFER_TOPIC0`, `VALID_APIKEY`, `GETADAPTERS_SIGN` are referenced across Tasks 5–7. In the actual file, define them once near the top (after imports) and reference them throughout. The plan shows them co-located with their first use for clarity — consolidation is a one-line move.
