import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET as decodeGET } from "../../app/api/v1/decode/route.js";
import { GET as decodeEventGET } from "../../app/api/v1/decode-event/route.js";
import { GET as fetchAbiGET } from "../../app/api/v1/fetch-abi/route.js";
import etherscanErc20 from "./__fixtures__/etherscan-erc20.json";

function makeRequest(base, params) {
  const url = new URL(`http://localhost${base}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  return { url: url.toString() };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  delete process.env.BACKEND_URL;
  delete process.env.ETHERSCAN_API_KEY;
  delete process.env.ROUTESCAN_API_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /api/v1/decode", () => {
  it("returns 400 when data param is missing", async () => {
    const res = await decodeGET(makeRequest("/api/v1/decode", {}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/missing data/i);
  });

  it("returns 500 when BACKEND_URL is not set", async () => {
    const res = await decodeGET(
      makeRequest("/api/v1/decode", { data: "0x12345678" }),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/backend url/i);
  });

  it("proxies to BACKEND_URL and returns the decoded result", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    const mockResult = { msg: "ok", data: [{ func: "transfer", args: {} }] };
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResult,
    });

    const res = await decodeGET(
      makeRequest("/api/v1/decode", { data: "0xa9059cbb" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(mockResult);

    const calledUrl = global.fetch.mock.calls[0][0];
    expect(calledUrl).toContain("data=0xa9059cbb");
  });
});

describe("GET /api/v1/decode-event", () => {
  it("returns 400 when sign param is missing", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    const res = await decodeEventGET(makeRequest("/api/v1/decode-event", {}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/missing sign/i);
  });

  it("returns 500 when BACKEND_URL is not set", async () => {
    const TOPIC0 =
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
    const res = await decodeEventGET(
      makeRequest("/api/v1/decode-event", { sign: TOPIC0 }),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/backend/i);
  });

  it("proxies to BACKEND_URL and returns the decoded event", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    const TOPIC0 =
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
    const mockResult = { msg: "ok", data: { event: "Transfer", args: {} } };
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResult,
    });

    const res = await decodeEventGET(
      makeRequest("/api/v1/decode-event", {
        sign: TOPIC0,
        topics: `${TOPIC0},0x000...`,
        data: "0x",
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(mockResult);

    const calledUrl = global.fetch.mock.calls[0][0];
    expect(calledUrl).toContain("sign=");
  });
});

describe("GET /api/v1/fetch-abi", () => {
  it("returns 400 when address param is missing", async () => {
    const res = await fetchAbiGET(
      makeRequest("/api/v1/fetch-abi", { etherscanApiKey: "test" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/missing address/i);
  });

  it("returns 400 when all sources fail to find the ABI", async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: false, status: 404, statusText: "Not Found" }) // Sourcify
      .mockResolvedValueOnce({ ok: false, status: 404, statusText: "Not Found" }); // RouteScan
    const res = await fetchAbiGET(
      makeRequest("/api/v1/fetch-abi", {
        address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/failed to fetch abi/i);
  });

  it("returns the ABI for a verified contract", async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) }) // Sourcify: no abi
      .mockResolvedValueOnce({ ok: true, json: async () => etherscanErc20 }); // Etherscan

    const res = await fetchAbiGET(
      makeRequest("/api/v1/fetch-abi", {
        address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        etherscanApiKey: "test-key",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.abi).toBeDefined();
    expect(body.abi.length).toBeGreaterThan(0);
    expect(body.isProxy).toBe(false);
  });
});
