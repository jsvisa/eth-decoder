import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET as decodeGET } from "../../app/api/v1/decode/route.js";
import { GET as decodeEventGET } from "../../app/api/v1/decode-event/route.js";
import { POST as fetchAbiPOST } from "../../app/api/v1/fetch-abi/route.js";
import etherscanErc20 from "./__fixtures__/etherscan-erc20.json";
import {
  serverCacheTestDir,
  resetServerCacheTestDir,
  removeServerCacheTestDir,
} from "../utils/serverCacheTestEnv.js";

const CACHE_DIR = serverCacheTestDir("v1-routes");

function makeRequest(base, params) {
  const url = new URL(`http://localhost${base}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  return { url: url.toString() };
}

function makePostRequest(base, params) {
  return new Request(`http://localhost${base}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
}

beforeEach(async () => {
  process.env.CACHE_DIR = CACHE_DIR;
  await resetServerCacheTestDir(CACHE_DIR);
  vi.stubGlobal("fetch", vi.fn());
  delete process.env.BACKEND_URL;
  delete process.env.ETHERSCAN_API_KEY;
  delete process.env.ROUTESCAN_API_KEY;
});

afterEach(async () => {
  vi.unstubAllGlobals();
  delete process.env.CACHE_DIR;
  await removeServerCacheTestDir(CACHE_DIR);
});

describe("GET /api/v1/decode", () => {
  it("returns 400 when data param is missing", async () => {
    const res = await decodeGET(makeRequest("/api/v1/decode", {}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/missing data/i);
  });

  it("decodes via Sourcify when BACKEND_URL is not set", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        result: {
          function: {
            "0xa9059cbb": [
              { name: "transfer(address,uint256)", filtered: false },
            ],
          },
        },
      }),
    });

    const res = await decodeGET(
      makeRequest("/api/v1/decode", {
        data: "0xa9059cbb000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb4800000000000000000000000000000000000000000000000000000000000f4240",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.msg).toBe("ok");
    expect(body.data[0].func).toBe("transfer(address,uint256)");
  });
});

describe("GET /api/v1/decode-event", () => {
  it("returns 400 when sign param is missing", async () => {
    const res = await decodeEventGET(makeRequest("/api/v1/decode-event", {}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/missing sign/i);
  });

  it("decodes via Sourcify when BACKEND_URL is not set", async () => {
    const TOPIC0 =
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        result: {
          event: {
            [TOPIC0]: [
              { name: "Transfer(address,address,uint256)", filtered: false },
            ],
          },
        },
      }),
    });

    const res = await decodeEventGET(
      makeRequest("/api/v1/decode-event", {
        sign: TOPIC0,
        topics: `${TOPIC0},0x000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48,0x000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2`,
        data: "0x00000000000000000000000000000000000000000000000000000000000f4240",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.msg).toBe("ok");
    expect(body.data.event).toBe("Transfer");
  });
});

describe("POST /api/v1/fetch-abi", () => {
  it("returns 400 when address param is missing", async () => {
    const res = await fetchAbiPOST(
      makePostRequest("/api/v1/fetch-abi", { etherscanApiKey: "test" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/missing address/i);
  });

  it("returns 400 when all sources fail to find the ABI", async () => {
    global.fetch
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      }) // Sourcify
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      }); // RouteScan
    const res = await fetchAbiPOST(
      makePostRequest("/api/v1/fetch-abi", {
        address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/failed to fetch abi/i);
  });

  it("returns the ABI for a verified contract", async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => etherscanErc20 }) // Etherscan
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) }); // Sourcify: no abi

    const res = await fetchAbiPOST(
      makePostRequest("/api/v1/fetch-abi", {
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
