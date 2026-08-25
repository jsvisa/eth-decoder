import { describe, it, expect } from "vitest";
import { GET } from "../../app/api/decode/route.js";

const TRANSFER_SELECTOR = "0xa9059cbb";
const VITALIK = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const ZERO_ADDRESS_PADDED =
  "0000000000000000000000000000000000000000000000000000000000000000";

function makeRequest(params) {
  const url = new URL("http://localhost/api/decode");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  return { url: url.toString() };
}

function buildTransferCalldata(toAddress, amountHex) {
  const paddedAddr = toAddress
    .toLowerCase()
    .replace("0x", "")
    .padStart(64, "0");
  const paddedAmount = amountHex.replace("0x", "").padStart(64, "0");
  return `0x${TRANSFER_SELECTOR.replace("0x", "")}${paddedAddr}${paddedAmount}`;
}

describe("GET /api/decode (integration)", () => {
  it("returns 400 when data is missing", async () => {
    const res = await GET(makeRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/missing data/i);
  });

  it("decodes a transfer(address,uint256) calldata", async () => {
    const calldata = buildTransferCalldata(VITALIK, ZERO_ADDRESS_PADDED);
    const res = await GET(makeRequest({ data: calldata }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.msg).toBe("ok");
    expect(body.data).toBeTruthy();
    expect(body.data.length).toBeGreaterThan(0);
    const decoded = body.data[0];
    expect(decoded.func).toBe("transfer(address,uint256)");
    expect(decoded.args).toBeDefined();
    expect(typeof decoded.args).toBe("object");
    expect(decoded.source).toBe("sourcify");
  }, 15000);

  it("decodes with with_abi flag", async () => {
    const calldata = buildTransferCalldata(VITALIK, ZERO_ADDRESS_PADDED);
    const res = await GET(makeRequest({ data: calldata, with_abi: "true" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.msg).toBe("ok");
    const decoded = body.data[0];
    expect(decoded.abi).toBeTruthy();
    expect(decoded.abi.type).toBe("function");
    expect(decoded.abi.name).toBe("transfer");
  }, 15000);

  it("decodes with with_sign flag", async () => {
    const calldata = buildTransferCalldata(VITALIK, ZERO_ADDRESS_PADDED);
    const res = await GET(makeRequest({ data: calldata, with_sign: "true" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.msg).toBe("ok");
    const decoded = body.data[0];
    expect(decoded.sign).toBe(TRANSFER_SELECTOR);
  }, 15000);
});
