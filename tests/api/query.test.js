import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "../../app/api/query/route.js";
import { GET as v1GET } from "../../app/api/v1/query/route.js";

const SOURCIFY_LOOKUP =
  "https://api.4byte.sourcify.dev/signature-database/v1/lookup";

function makeRequest(params) {
  const url = new URL("http://localhost/api/query");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  return { url: url.toString() };
}

function sourcifyResponse(sigs) {
  return {
    ok: true,
    json: async () => ({
      ok: true,
      result: {
        function: {
          "0xa9059cbb": sigs.map((s) => ({ name: s, filtered: false })),
        },
      },
    }),
  };
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

  describe("Sourcify primary path", () => {
    it("returns Sourcify results for function selectors", async () => {
      global.fetch.mockResolvedValueOnce(
        sourcifyResponse(["transfer(address,uint256)"]),
      );

      const res = await GET(makeRequest({ sign: "0xa9059cbb" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.msg).toBe("ok");
      expect(body.data.text_sign).toBe("transfer(address,uint256)");
    });

    it("honors count param for Sourcify results", async () => {
      global.fetch.mockResolvedValueOnce(
        sourcifyResponse([
          "transfer(address,uint256)",
          "transfer(address,uint256,bytes)",
        ]),
      );

      const res = await GET(makeRequest({ sign: "0xa9059cbb", count: "2" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(2);
    });

    it("defaults count to 1 for Sourcify results", async () => {
      global.fetch.mockResolvedValueOnce(
        sourcifyResponse([
          "transfer(address,uint256)",
          "transfer(address,uint256,bytes)",
        ]),
      );

      const res = await GET(makeRequest({ sign: "0xa9059cbb" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).not.toBeNull();
      // Returned as single object (not array) because count defaults to 1
      expect(body.data.text_sign).toBe("transfer(address,uint256)");
    });

    it("does not require BACKEND_URL when Sourcify has results", async () => {
      global.fetch.mockResolvedValueOnce(
        sourcifyResponse(["transfer(address,uint256)"]),
      );

      const res = await GET(makeRequest({ sign: "0xa9059cbb" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.msg).toBe("ok");
      // Only one fetch call (Sourcify) — no backend call
      expect(global.fetch.mock.calls).toHaveLength(1);
    });

    it("queries Sourcify with function param for 4-byte selectors", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          result: { function: { "0x341d16d9": [] } },
        }),
      });

      await GET(makeRequest({ sign: "0x341d16d9" }));

      const calledUrl = global.fetch.mock.calls[0][0];
      expect(calledUrl).toContain(SOURCIFY_LOOKUP);
      expect(calledUrl).toContain("function=0x341d16d9");
    });

    it("queries Sourcify with event param for event topics", async () => {
      const topic =
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, result: { event: { [topic]: [] } } }),
      });

      await GET(makeRequest({ sign: topic }));

      const calledUrl = global.fetch.mock.calls[0][0];
      expect(calledUrl).toContain(SOURCIFY_LOOKUP);
      expect(calledUrl).toContain(`event=${topic}`);
    });
  });

  describe("Backend fallback (Sourcify returns empty)", () => {
    it("falls back to backend when Sourcify has no match", async () => {
      process.env.BACKEND_URL = "https://backend.test";
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ok: true,
            result: { function: { "0x341d16d9": [] } },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            msg: "ok",
            data: { text_sign: "claim()", output: null, abi: null },
          }),
        });

      const res = await GET(makeRequest({ sign: "0x341d16d9" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.msg).toBe("ok");
      expect(body.data.text_sign).toBe("claim()");

      expect(global.fetch.mock.calls).toHaveLength(2);
      expect(global.fetch.mock.calls[0][0]).toContain(SOURCIFY_LOOKUP);
      expect(global.fetch.mock.calls[1][0]).toContain("backend.test");
    });

    it("forwards sign and count to backend in fallback", async () => {
      process.env.BACKEND_URL = "https://backend.test";
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ok: true,
            result: { function: { "0xa9059cbb": [] } },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            msg: "ok",
            data: {
              text_sign: "transfer(address,uint256)",
              output: "()",
              abi: null,
            },
          }),
        });

      const res = await GET(makeRequest({ sign: "0xa9059cbb", count: "1" }));
      expect(res.status).toBe(200);

      const calledUrl = global.fetch.mock.calls[1][0];
      expect(calledUrl).toContain("sign=0xa9059cbb");
      expect(calledUrl).toContain("count=1");
      expect(calledUrl).not.toContain("apikey");
    });

    it("defaults count to 1 for backend fallback", async () => {
      process.env.BACKEND_URL = "https://backend.test";
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ok: true,
            result: { function: { "0xa9059cbb": [] } },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ msg: "not found", data: null }),
        });

      await GET(makeRequest({ sign: "0xa9059cbb" }));

      const backendUrl = global.fetch.mock.calls[1][0];
      expect(backendUrl).toContain("count=1");
    });

    it("forwards count > 1 for backend fallback", async () => {
      process.env.BACKEND_URL = "https://backend.test";
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ok: true,
            result: { function: { "0xa9059cbb": [] } },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            msg: "ok",
            data: [
              {
                text_sign: "transfer(address,uint256)",
                output: "()",
                abi: null,
              },
              {
                text_sign: "transfer(address,uint256,bytes)",
                output: "()",
                abi: null,
              },
            ],
          }),
        });

      const res = await GET(makeRequest({ sign: "0xa9059cbb", count: "2" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(2);

      const calledUrl = global.fetch.mock.calls[1][0];
      expect(calledUrl).toContain("count=2");
    });
  });

  describe("Both sources fail", () => {
    it("returns not found when both Sourcify and backend have no match", async () => {
      process.env.BACKEND_URL = "https://backend.test";
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ok: true,
            result: { function: { "0x341d16d9": [] } },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ msg: "not found", data: null }),
        });

      const res = await GET(makeRequest({ sign: "0x341d16d9" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.msg).toBe("not found");
      expect(body.data).toBeNull();
    });

    it("returns not found when Sourcify is unreachable and backend has no match", async () => {
      process.env.BACKEND_URL = "https://backend.test";
      global.fetch
        .mockRejectedValueOnce(new Error("Sourcify unreachable"))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ msg: "not found", data: null }),
        });

      const res = await GET(makeRequest({ sign: "0x341d16d9" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.msg).toBe("not found");
      expect(body.data).toBeNull();
    });

    it("returns not found when Sourcify empty and BACKEND_URL is not configured", async () => {
      global.fetch.mockResolvedValueOnce({
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

    it("returns not found when Sourcify empty and backend returns non-OK status", async () => {
      process.env.BACKEND_URL = "https://backend.test";
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ok: true,
            result: { function: { "0x341d16d9": [] } },
          }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          statusText: "Service Unavailable",
        });

      const res = await GET(makeRequest({ sign: "0x341d16d9" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.msg).toBe("not found");
      expect(body.data).toBeNull();
    });

    it("returns not found when Sourcify empty and backend fetch throws", async () => {
      process.env.BACKEND_URL = "https://backend.test";
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ok: true,
            result: { function: { "0x341d16d9": [] } },
          }),
        })
        .mockRejectedValueOnce(new Error("Network failure"));

      const res = await GET(makeRequest({ sign: "0x341d16d9" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.msg).toBe("not found");
      expect(body.data).toBeNull();
    });
  });
});

describe("GET /api/v1/query", () => {
  it("re-exports the same handler as /api/query", () => {
    expect(v1GET).toBe(GET);
  });
});
