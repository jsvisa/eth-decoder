import main as main_module


def test_get_db_connection_uses_sqlite(db_path):
    """get_db_connection() should return a sqlite3 connection when DB_URL is sqlite:///."""
    import sqlite3
    conn = main_module.get_db_connection()
    assert isinstance(conn, sqlite3.Connection)
    conn.close()


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
