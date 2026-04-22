# abi_server Testing Design

**Date:** 2026-04-22
**Component:** `abi_server/` — FastAPI service for EVM ABI lookup and transaction decoding

## Goals

- Test all four API endpoints (`/api/v1/decode`, `/api/v1/decode-event`, `/api/v1/query`, `/api/v1/query-event`)
- Test pure utility functions (`is_valid_hex_data`, `extract_output_sign`, `serialize_value`, `decode_event_log`)
- Run entirely without a live PostgreSQL instance
- Use real data from `evm.func_sign.csv` (10,000 rows) as test fixtures

## Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Test DB | SQLite (via `sqlite3`) | No Docker/Postgres needed in CI; add SQLite support to `main.py` |
| Fixture data | `evm.func_sign.csv` loaded into SQLite | Real function and event signatures, not synthetic mocks |
| Test framework | pytest + httpx | Standard Python; httpx provides `TestClient` via `starlette.testclient` |
| Indexed-count filtering | Python (not SQL JSONB) | Removes Postgres-specific JSONB dependency; simpler and portable |

## main.py Changes

### 1. `get_db_connection()`

Detect SQLite vs Postgres by URL prefix:

```python
def get_db_connection():
    if DB_URL and DB_URL.startswith("sqlite:///"):
        import sqlite3
        return sqlite3.connect(DB_URL[len("sqlite:///"):])
    return psycopg2.connect(DB_URL)
```

### 2. Two small helpers

```python
def _param():
    """SQL parameter placeholder: ? for SQLite, %s for Postgres."""
    return "?" if (DB_URL and DB_URL.startswith("sqlite:///")) else "%s"

def _table():
    """Table name: no schema prefix for SQLite."""
    return "func_signs" if (DB_URL and DB_URL.startswith("sqlite:///")) else "evm.func_signs"

def _parse_abi(val):
    """Normalize ABI: sqlite3 returns TEXT, psycopg2/JSONB returns dict."""
    import json
    if isinstance(val, str):
        return json.loads(val)
    return val
```

### 3. `get_abi_by_sign()` — use helpers, normalize ABI

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

### 4. `get_event_abi_by_topic()` — remove JSONB query, filter in Python

```python
def get_event_abi_by_topic(topic0, count=1, num_indexed=None):
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

## Test File Structure

```
abi_server/
├── tests/
│   ├── conftest.py     — session-scoped SQLite DB; monkeypatches main.DB_URL per test
│   └── test_main.py    — unit + API integration tests
pyproject.toml          — add pytest, httpx to [project.optional-dependencies]
```

## API Key in Tests

`main.py` reads `APIKEY = os.getenv("ABI_SERVER_APIKEY", ")")`. Tests use the default value `")"` — no env var override needed. Query params must pass `apikey=%29` (URL-encoded) or use the `params=` dict in the test client which handles encoding automatically.

## conftest.py

```python
import csv
import json
import sqlite3
from pathlib import Path
import pytest
from starlette.testclient import TestClient
import main as main_module
from main import app

CSV_PATH = Path(__file__).parent.parent.parent / "evm.func_sign.csv"

@pytest.fixture(scope="session")
def db_path(tmp_path_factory):
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
    monkeypatch.setattr(main_module, "DB_URL", f"sqlite:///{db_path}")

@pytest.fixture
def client():
    return TestClient(app)
```

## test_main.py — Test Cases

### Unit: `is_valid_hex_data`

| Test | Input | Expected |
|------|-------|----------|
| valid with `0x` prefix | `"0x1234abcd"` | `True` |
| valid without prefix | `"1234abcd"` | `True` |
| invalid chars | `"0xzzzz"` | `False` |
| empty string | `""` | `False` |

### Unit: `extract_output_sign`

| Test | ABI outputs | Expected |
|------|-------------|----------|
| single `uint256` | `[{type: uint256}]` | `"(uint256)"` |
| tuple output | `[{type: tuple, components: [{type: uint128}, {type: bool}]}]` | `"((uint128,bool))"` |

### Unit: `serialize_value`

| Test | Input | Expected |
|------|-------|----------|
| int | `123` | `"123"` |
| nested list with ints | `[1, [2, 3]]` | `["1", ["2", "3"]]` |
| dict | `{"a": 5}` | `{"a": "5"}` |
| string passthrough | `"hello"` | `"hello"` |

### Unit: `decode_event_log` — Transfer event

Uses the Transfer ABI from the CSV (`fromAddress`, `toAddress` are indexed; `value` is not).

```
from_addr = 0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48
to_addr   = 0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2
value     = 1000000 (0xf4240)

topics = [
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
  "0x000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  "0x000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
]
data = "0x00000000000000000000000000000000000000000000000000000000000f4240"
```

Assert: `result["event"] == "Transfer"`, `result["args"]["fromAddress"]` contains the from address, `result["args"]["value"] == "1000000"`.

### API: `GET /api/v1/decode`

| Test | Input | Expected |
|------|-------|----------|
| missing `data` param | no `data` | 422 (FastAPI validation) |
| too short | `data=0x1234` | 400 |
| invalid hex | `data=0xzzzzzzzz` | 400 |
| known no-input function | `data=0xb82e16e3` (`getAdapters()`) | 200, `msg=="ok"`, `data[0]["func"]=="getAdapters"` |
| unknown sign | `data=0xdeadbeef` | 200, `msg=="error"` |
| `with_sign=true` | `data=0xb82e16e3&with_sign=true` | 200, result contains `sign` field |
| `with_abi=true` | `data=0xb82e16e3&with_abi=true` | 200, result contains `abi` field |

### API: `GET /api/v1/decode-event`

| Test | Input | Expected |
|------|-------|----------|
| missing `sign` | no `sign` | 400 |
| unknown sign | `sign=0xdeadbeef` | 200, `msg=="not found"` |
| Transfer (2 indexed) | Transfer topic0 + 2 indexed topics + data | 200, `msg=="ok"`, `event=="Transfer"`, `args["value"]=="1000000"` |
| Approval (2 indexed) | Approval topic0 + 2 indexed topics + data | 200, `msg=="ok"`, `event=="Approval"`, `args["_tokenId"]=="42"` |

**Transfer fixture:**
```
sign   = 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef
topics = <topic0>,0x000...a0b86991...,0x000...c02aaa39...
data   = 0x00000000000000000000000000000000000000000000000000000000000f4240
```

**Approval fixture:**
```
sign   = 0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925
topics = <topic0>,0x000...a0b86991...,0x000...c02aaa39...
data   = 0x000000000000000000000000000000000000000000000000000000000000002a
```

### API: `GET /api/v1/query`

| Test | Input | Expected |
|------|-------|----------|
| wrong apikey | `apikey=bad&sign=0x1234` | 401 |
| known function sign | correct apikey + `sign=0xb82e16e3` | 200, `data.text_sign=="getAdapters()"` |
| unknown sign | correct apikey + `sign=0xdeadbeef` | 200, `msg=="not found"` |

### API: `GET /api/v1/query-event`

| Test | Input | Expected |
|------|-------|----------|
| wrong apikey | `apikey=bad&sign=0xddf2...` | 401 |
| known event sign | correct apikey + Transfer topic0 | 200, `data.text_sign=="Transfer(address,address,uint256)"` |
| missing `sign` | correct apikey, no `sign` | 400 |

## pyproject.toml Changes

```toml
[project.optional-dependencies]
test = ["pytest>=8", "httpx>=0.27"]
```

Install with: `pip install -e ".[test]"`

## CI Integration

Add to `.github/workflows/ci.yml` as a new job (blocking):

```yaml
test-abi-server:
  name: abi_server Tests
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-python@v5
      with:
        python-version: "3.11"
    - name: Install dependencies
      run: pip install -e ".[test]"
      working-directory: abi_server
    - name: Run tests
      run: pytest tests/ -v
      working-directory: abi_server
```

## Out of Scope

- `get_abi_by_sign` SQL test (integration test against real Postgres)
- Multicall decode testing (requires multicall-format calldata)
- Load/stress testing
