// tests/api/decode.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "../../app/api/decode/route.js";
import {
  serverCacheTestDir,
  resetServerCacheTestDir,
  removeServerCacheTestDir,
} from "../utils/serverCacheTestEnv.js";

const CACHE_DIR = serverCacheTestDir("decode");

// transfer(address,uint256) — selector 0xa9059cbb
const TRANSFER_CALLDATA =
  "0xa9059cbb" +
  "000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" +
  "00000000000000000000000000000000000000000000000000000000000f4240";

function makeRequest(params) {
  const url = new URL("http://localhost/api/decode");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  return { url: url.toString() };
}

function backendResponse(rows) {
  return { ok: true, json: async () => ({ msg: "ok", data: rows }) };
}

function backendNotFound() {
  return { ok: true, json: async () => ({ msg: "not found", data: null }) };
}

function sourcifyResponse(selector, names) {
  return {
    ok: true,
    json: async () => ({
      ok: true,
      result: {
        function: {
          [selector]: names.map((n) => ({ name: n, filtered: false })),
        },
      },
    }),
  };
}

beforeEach(async () => {
  process.env.CACHE_DIR = CACHE_DIR;
  await resetServerCacheTestDir(CACHE_DIR);
  vi.stubGlobal("fetch", vi.fn());
  delete process.env.BACKEND_URL;
});

afterEach(async () => {
  vi.unstubAllGlobals();
  delete process.env.CACHE_DIR;
  await removeServerCacheTestDir(CACHE_DIR);
});

describe("GET /api/decode", () => {
  it("returns 400 when the data param is missing", async () => {
    const res = await GET(makeRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/missing data/i);
  });

  it("decodes via Sourcify when BACKEND_URL is not set", async () => {
    global.fetch.mockResolvedValueOnce(
      sourcifyResponse("0xa9059cbb", ["transfer(address,uint256)"]),
    );

    const res = await GET(makeRequest({ data: TRANSFER_CALLDATA }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.msg).toBe("ok");
    expect(body.data[0].func).toBe("transfer(address,uint256)");
    expect(body.data[0].source).toBe("sourcify");
    expect(global.fetch.mock.calls).toHaveLength(1);
  });

  it("prefers a DB candidate over Sourcify when both match", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    global.fetch
      .mockResolvedValueOnce(
        backendResponse([
          {
            text_sign: "transfer(address,uint256)",
            abi: JSON.stringify({
              type: "function",
              name: "transfer",
              inputs: [
                { name: "to", type: "address" },
                { name: "amount", type: "uint256" },
              ],
            }),
          },
        ]),
      )
      .mockResolvedValueOnce(
        sourcifyResponse("0xa9059cbb", ["transfer(address,uint256)"]),
      );

    const res = await GET(makeRequest({ data: TRANSFER_CALLDATA }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0].func).toBe("transfer(address,uint256)");
    expect(body.data[0].source).toBe("cfd1");
    expect(body.data[0].args.to.toLowerCase()).toBe(
      "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    );
  });

  it("falls back to Sourcify when the DB has no candidates", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    global.fetch
      .mockResolvedValueOnce(backendNotFound())
      .mockResolvedValueOnce(
        sourcifyResponse("0xa9059cbb", ["transfer(address,uint256)"]),
      );

    const res = await GET(makeRequest({ data: TRANSFER_CALLDATA }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0].func).toBe("transfer(address,uint256)");
    expect(body.data[0].source).toBe("sourcify");
  });

  it("returns not found when nothing decodes", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    global.fetch
      .mockResolvedValueOnce(backendNotFound())
      .mockResolvedValueOnce(sourcifyResponse("0xa9059cbb", []));

    const res = await GET(makeRequest({ data: TRANSFER_CALLDATA }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.msg).toBe("not found");
    expect(body.data).toBeNull();
  });

  it("attaches sign and abi fields when with_sign and with_abi are true", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    const abi = {
      type: "function",
      name: "transfer",
      inputs: [
        { name: "to", type: "address" },
        { name: "amount", type: "uint256" },
      ],
    };
    global.fetch
      .mockResolvedValueOnce(
        backendResponse([
          { text_sign: "transfer(address,uint256)", abi: JSON.stringify(abi) },
        ]),
      )
      .mockResolvedValueOnce(sourcifyResponse("0xa9059cbb", []));

    const res = await GET(
      makeRequest({
        data: TRANSFER_CALLDATA,
        with_sign: "true",
        with_abi: "true",
      }),
    );
    const body = await res.json();
    expect(body.data[0].sign).toBe("0xa9059cbb");
    expect(body.data[0].abi).toEqual(abi);
  });

  it("omits sign and abi fields when with_sign and with_abi are not set", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    global.fetch
      .mockResolvedValueOnce(backendNotFound())
      .mockResolvedValueOnce(
        sourcifyResponse("0xa9059cbb", ["transfer(address,uint256)"]),
      );

    const res = await GET(makeRequest({ data: TRANSFER_CALLDATA }));
    const body = await res.json();
    expect(body.data[0].sign).toBeUndefined();
    expect(body.data[0].abi).toBeUndefined();
  });
});
