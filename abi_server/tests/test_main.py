import main as main_module
from main import (
    decode_event_log,
    extract_output_sign,
    is_valid_hex_data,
    serialize_value,
)


def test_get_db_connection_uses_sqlite(db_path):
    """get_db_connection() should return a sqlite3 connection when DB_URL is sqlite:///."""
    import sqlite3
    conn = main_module.get_db_connection()
    assert isinstance(conn, sqlite3.Connection)
    conn.close()

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
TRANSFER_TOPIC1 = "0x000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
TRANSFER_TOPIC2 = "0x000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"
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


# ---------------------------------------------------------------------------
# GET /api/v1/query
# ---------------------------------------------------------------------------

VALID_APIKEY = ")"  # default value of ABI_SERVER_APIKEY in main.py
GETADAPTERS_SIGN = "0xb82e16e3"  # getAdapters() — present in evm.func_sign.csv


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


# ---------------------------------------------------------------------------
# GET /api/v1/decode
# ---------------------------------------------------------------------------


def test_decode_too_short_returns_422(client):
    # FastAPI's Query(min_length=8) returns 422 for strings shorter than 8 chars;
    # "0x1234" is 6 chars, so the framework rejects it before the handler runs.
    resp = client.get("/api/v1/decode", params={"data": "0x1234"})
    assert resp.status_code == 422


def test_decode_invalid_hex_returns_400(client):
    resp = client.get("/api/v1/decode", params={"data": "0xzzzzzzzz"})
    assert resp.status_code == 400


def test_decode_unknown_sign_returns_empty_ok(client):
    # 0xdeadbeef is not in the DB; decode_with_data returns [] (no errors, no
    # decoded results), so the endpoint responds with msg="ok" and data=[].
    resp = client.get("/api/v1/decode", params={"data": "0xdeadbeef"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["msg"] == "ok"
    assert body["data"] == []


def test_decode_known_no_input_function_returns_ok(client):
    # getAdapters() has no inputs — calldata is just the 4-byte selector.
    # The "func" field is the text_sign stored in the DB, i.e. "getAdapters()".
    resp = client.get("/api/v1/decode", params={"data": "0xb82e16e3"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["msg"] == "ok"
    assert body["data"][0]["func"] == "getAdapters()"


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
