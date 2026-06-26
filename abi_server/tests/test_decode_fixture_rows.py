WRAP_NATIVE_CALLDATA = (
    "0x3244c12c"
    "000000000000000000000000000000000000000000000000030d98d59a960000"
    "000000000000000000000000b98c948cfa24072e58935bc004a8a7b376ae746a"
)


def test_decode_wrap_native_fixture_row(client):
    resp = client.get("/api/v1/decode", params={"data": WRAP_NATIVE_CALLDATA})
    assert resp.status_code == 200

    body = resp.json()
    assert body["msg"] == "ok"
    assert body["data"][0]["func"] == "wrapNative(uint256,address)"
    assert body["data"][0]["args"]["arg0"] == "220000000000000000"
    assert body["data"][0]["args"]["arg1"].lower() == (
        "0xb98c948cfa24072e58935bc004a8a7b376ae746a"
    )
