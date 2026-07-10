#!/usr/bin/env python3

import json
import os
import logging
import uvicorn
import sqlite3
import psycopg2
from typing import List, Dict
from eth_utils.abi import collapse_if_tuple
from multicall.eth_decode import eth_decode_input
from fastapi import FastAPI, HTTPException, Query
from serialization import decode_event_log, serialize_value

logging.basicConfig(
    format="[%(asctime)s] - %(levelname)s - %(message)s", level=logging.INFO
)

# some tx has a very large tx.input, don't limit the size of tx.input
# eg https://etherscan.io/tx/0xe0b20e4bc3dd2c5af2d365c9c9af190756699de5155bc9251196532a2a869d5e
MAX_BODY_SIZE = 10 * 1024 * 1024
DB_URL = os.getenv("POSTGRES_DATABASE_URL")


def _param():
    """SQL parameter placeholder: ? for SQLite, %s for Postgres."""
    return "?" if (DB_URL and DB_URL.startswith("sqlite:///")) else "%s"


def _table():
    """Table name without schema prefix for SQLite."""
    return (
        "func_signs"
        if (DB_URL and DB_URL.startswith("sqlite:///"))
        else "evm.func_signs"
    )


def _parse_abi(val):
    """Normalize ABI field: sqlite3 returns TEXT strings, psycopg2 JSONB returns dicts."""
    if isinstance(val, str):
        try:
            return json.loads(val)
        except json.JSONDecodeError:
            return None
    return val


app = FastAPI()


"""
CREATE SCHEMA IF NOT EXISTS evm;

CREATE TABLE IF NOT EXISTS evm.func_signs (
    pkey                TEXT PRIMARY KEY,      -- pkey = md5(byte_sign || text_sign || abi::text)
    byte_sign           TEXT NOT NULL,
    text_sign           TEXT NOT NULL,
    abi                 JSONB,
    score               INTEGER DEFAULT 0,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS evm_func_signs_b_idx ON evm.func_signs (byte_sign);
CREATE INDEX IF NOT EXISTS evm_func_signs_t_idx ON evm.func_signs (split_part(text_sign, '(', 1));

-- Note: evm.func_signs stores both function signatures (4-byte byte_sign)
-- and event signatures (32-byte byte_sign / topic0). No separate table needed.
"""


def get_db_connection():
    if DB_URL and DB_URL.startswith("sqlite:///"):
        return sqlite3.connect(DB_URL[len("sqlite:///") :])
    return psycopg2.connect(DB_URL)


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


def extract_output_sign(abi: Dict) -> str:
    outputs = abi.get("outputs") or []
    if len(outputs) == 0:
        return ""
    return "({})".format(",".join([collapse_if_tuple(e) for e in outputs]))


@app.get("/api/v1/query")
async def get_abi(
    sign: str = Query(None, description="Signature string"),
    count: int = Query(1, description="Number of results to return"),
):
    rows = get_abi_by_sign(sign, count)
    if len(rows) == 0:
        return {"msg": "not found", "data": None}
    outputs = {}
    for idx, row in enumerate(rows):
        if row[1] is not None:
            outputs[idx] = extract_output_sign(row[1])
    if count == 1:
        row = rows[0]
        data = {"text_sign": row[0], "output": outputs.get(0), "abi": row[1]}
    else:
        data = [
            {"text_sign": row[0], "output": outputs.get(idx), "abi": row[1]}
            for idx, row in enumerate(rows)
        ]
    return {"msg": "ok", "data": data}


@app.get("/api/v1/decode")
async def decode_abi(
    data: str = Query(
        None, description="Input data string", min_length=8, max_length=1024 * 1024
    ),
    count: int = Query(3, description="Number of abies to retry"),
    multicall: bool = Query(False, description="Multicall flag"),
    with_abi: bool = Query(False, description="Return with ABI flag"),
    with_sign: bool = Query(False, description="Return with sign flag"),
):
    if data is None or len(data) < 8:
        raise HTTPException(status_code=400, detail="Invalid input data")

    if not is_valid_hex_data(data):
        raise HTTPException(status_code=400, detail="invalid hex data")

    decoded = decode_with_data(data, count, with_abi, with_sign)
    is_error = len([1 for item in decoded if "error" in item]) > 0
    if is_error:
        return {"msg": "error", "error": decoded}

    if multicall is True:
        inner = []
        for item in decoded:
            MC_KEY = "data"
            if MC_KEY not in item["args"]:
                inner.append([])
                continue

            inner_decoded = []
            for inner_data in item["args"][MC_KEY]:
                inner_decoded.append(
                    decode_with_data(inner_data, 1, with_abi, with_sign)[0]
                )
            inner.append(inner_decoded)
        decoded = inner

    return {"msg": "ok", "data": decoded}


def is_valid_hex_data(data: str) -> bool:
    if data.startswith("0x"):
        data = data[2:]
    if not data:
        return False
    try:
        bytes.fromhex(data)
        return True
    except ValueError:
        return False


def decode_with_data(data, count=1, with_abi=False, with_sign=False) -> List[Dict]:
    if not data.startswith("0x"):
        data = "0x" + data
    sign = data[0:10]
    rows = get_abi_by_sign(sign, count)

    errors = []
    decoded = []
    for row in rows:
        abi = row[1]
        try:
            func, args = eth_decode_input(abi, data)
            item = {"func": func, "args": serialize_value(args)}
            if with_sign is True:
                item["sign"] = sign
            if with_abi is True:
                item["abi"] = abi
            decoded.append(item)
            break
        except Exception as err:
            logging.error("Error decoding data: {} err: {}".format(data, err))
            errors.append({"error": str(err), "abi": abi})
    if len(decoded) > 0:
        return decoded
    return errors


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
            row
            for row in rows
            if row[1]
            and sum(1 for inp in row[1].get("inputs", []) if inp.get("indexed"))
            == num_indexed
        ]

    return rows[:count]


@app.get("/api/v1/query-event")
async def query_event(
    sign: str = Query(
        None, description="topic0 hex (32-byte keccak256 of event signature)"
    ),
    count: int = Query(1, description="Number of results to return"),
):
    if not sign:
        raise HTTPException(status_code=400, detail="sign is required")
    rows = get_event_abi_by_topic(sign, count)
    if not rows:
        return {"msg": "not found", "data": None}
    if count == 1:
        row = rows[0]
        return {"msg": "ok", "data": {"text_sign": row[0], "abi": row[1]}}
    return {
        "msg": "ok",
        "data": [{"text_sign": row[0], "abi": row[1]} for row in rows],
    }


@app.get("/api/v1/decode-event")
async def decode_event(
    sign: str = Query(None, description="topic0 hex"),
    topics: str = Query(None, description="Comma-separated list of topic hashes"),
    data: str = Query("0x", description="Log data hex"),
    count: int = Query(1, description="Number of ABIs to try"),
):
    if not sign:
        raise HTTPException(status_code=400, detail="sign (topic0) is required")

    topic_list = [t.strip() for t in topics.split(",")] if topics else [sign]
    if not topic_list[0].startswith("0x"):
        topic_list[0] = "0x" + topic_list[0]

    # topics[0] is the event sig hash; remaining topics are indexed params.
    # Only fetch ABIs whose indexed field count matches exactly.
    num_indexed = len(topic_list) - 1
    rows = get_event_abi_by_topic(sign, count, num_indexed=num_indexed)
    if not rows:
        return {"msg": "not found", "data": None}

    for row in rows:
        abi = row[1]
        if abi is None:
            continue
        try:
            result = decode_event_log(abi, topic_list, data or "0x")
            result["inputs"] = abi.get(
                "inputs", []
            )  # include full ABI inputs for type/indexed info
            return {"msg": "ok", "data": result}
        except Exception as err:
            logging.error("Error decoding event sign=%s err=%s", sign, err)

    return {"msg": "error", "data": None}


def main():
    if DB_URL is None:
        raise ValueError("POSTGRES_DATABASE_URL is not set")
    uvicorn.run(
        app, host="0.0.0.0", port=8000, h11_max_incomplete_event_size=MAX_BODY_SIZE
    )


if __name__ == "__main__":
    main()
