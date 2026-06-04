import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "../../app/api/query/route.js";
import { GET as v1GET } from "../../app/api/v1/query/route.js";

function makeRequest(params) {
  const url = new URL("http://localhost/api/query");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  return { url: url.toString() };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  delete process.env.BACKEND_URL;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /api/query", () => {
  it("returns 400 when sign param is missing", async () => {
    const res = await GET(makeRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/missing sign/i);
  });

  it("returns 500 when BACKEND_URL is not set", async () => {
    const res = await GET(makeRequest({ sign: "0xa9059cbb" }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/BACKEND_URL/i);
  });

  it("proxies sign and count to backend and returns result", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    const mockResult = {
      msg: "ok",
      data: {
        text_sign: "transfer(address,uint256)",
        output: "()",
        abi: { name: "transfer", type: "function", inputs: [], outputs: [] },
      },
    };
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResult,
    });

    const res = await GET(makeRequest({ sign: "0xa9059cbb", count: "1" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(mockResult);

    const calledUrl = global.fetch.mock.calls[0][0];
    expect(calledUrl).toContain("sign=0xa9059cbb");
    expect(calledUrl).toContain("count=1");
    expect(calledUrl).not.toContain("apikey");
  });

  it("defaults count to 1 when not provided", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ msg: "not found", data: null }),
    });

    await GET(makeRequest({ sign: "0xa9059cbb" }));

    const calledUrl = global.fetch.mock.calls[0][0];
    expect(calledUrl).toContain("count=1");
  });

  it("forwards count > 1 for multiple results", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    const mockResult = {
      msg: "ok",
      data: [
        { text_sign: "transfer(address,uint256)", output: "()", abi: null },
        {
          text_sign: "transfer(address,uint256,bytes)",
          output: "()",
          abi: null,
        },
      ],
    };
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResult,
    });

    const res = await GET(makeRequest({ sign: "0xa9059cbb", count: "2" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);

    const calledUrl = global.fetch.mock.calls[0][0];
    expect(calledUrl).toContain("count=2");
  });

  it("returns 500 with error message when backend returns non-OK status", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
    });

    const res = await GET(makeRequest({ sign: "0xa9059cbb" }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(typeof body.error).toBe("string");
  });

  it("returns 500 when fetch throws (network error)", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    global.fetch.mockRejectedValueOnce(new Error("Network failure"));

    const res = await GET(makeRequest({ sign: "0xa9059cbb" }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Network failure");
  });
});

describe("OpenChain fallback (backend returns not found)", () => {
  it("falls back to OpenChain and returns its result when backend has no match", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ msg: "not found", data: null }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          result: {
            function: {
              "0x341d16d9": [{ name: "claim()", filtered: false }],
            },
          },
        }),
      });

    const res = await GET(makeRequest({ sign: "0x341d16d9" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.msg).toBe("ok");
    expect(body.data.text_sign).toBe("claim()");
  });

  it("queries OpenChain with function param for 4-byte selectors", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ msg: "not found", data: null }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          result: { function: { "0x341d16d9": [] } },
        }),
      });

    await GET(makeRequest({ sign: "0x341d16d9" }));

    const openchaindUrl = global.fetch.mock.calls[1][0];
    expect(openchaindUrl).toContain("api.openchain.xyz");
    expect(openchaindUrl).toContain("function=0x341d16d9");
  });

  it("returns not found when both backend and OpenChain have no match", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ msg: "not found", data: null }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          result: { function: { "0x341d16d9": [] } },
        }),
      });

    const res = await GET(makeRequest({ sign: "0x341d16d9" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.msg).toBe("not found");
    expect(body.data).toBeNull();
  });

  it("returns not found when OpenChain is unreachable after backend not found", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ msg: "not found", data: null }),
      })
      .mockRejectedValueOnce(new Error("OpenChain unreachable"));

    const res = await GET(makeRequest({ sign: "0x341d16d9" }));
    // openchain.js silently swallows errors, so we degrade to "not found"
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.msg).toBe("not found");
    expect(body.data).toBeNull();
  });
});

describe("GET /api/v1/query", () => {
  it("re-exports the same handler as /api/query", () => {
    expect(v1GET).toBe(GET);
  });
});
