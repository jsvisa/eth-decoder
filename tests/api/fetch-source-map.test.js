import { describe, it, expect, vi, afterEach } from "vitest";
import { GET } from "../../app/api/fetch-source-map/route.js";

const VALID_ADDRESS = "0xdAC17F958D2ee523a2206206994597C13D831ec7";

function makeRequest(params) {
  const url = new URL("http://localhost/api/fetch-source-map");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  return { url: url.toString() };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /api/fetch-source-map", () => {
  it("returns 400 when address is missing", async () => {
    const res = await GET(makeRequest({ chainId: "1" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/missing address/i);
  });

  it("returns 400 when chainId is missing", async () => {
    const res = await GET(makeRequest({ address: VALID_ADDRESS }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/missing chainId/i);
  });

  it("returns sourceMap and sources on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          evm: {
            deployedBytecode: {
              sourceMap: "0:1:0:0:0;1:2:0:0:0",
            },
          },
          sources: {
            "Token.sol": { content: "contract Token {}" },
          },
        }),
      }),
    );

    const res = await GET(
      makeRequest({ address: VALID_ADDRESS, chainId: "1" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sourceMap).toBe("0:1:0:0:0;1:2:0:0:0");
    expect(body.sources).toEqual({ "Token.sol": "contract Token {}" });
  });

  it("returns 404 when Sourcify returns not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404 }),
    );

    const res = await GET(
      makeRequest({ address: VALID_ADDRESS, chainId: "1" }),
    );
    expect(res.status).toBe(404);
  });

  it("handles missing sourceMap gracefully", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          evm: {},
          sources: { "Main.sol": { content: "contract Main {}" } },
        }),
      }),
    );

    const res = await GET(
      makeRequest({ address: VALID_ADDRESS, chainId: "1" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sourceMap).toBeNull();
    expect(body.sources).toEqual({ "Main.sol": "contract Main {}" });
  });
});

describe("GET /api/fetch-source-map — input validation", () => {
  it("returns 400 for a non-address value", async () => {
    const res = await GET(makeRequest({ address: "../escape", chainId: "1" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid address/i);
  });

  it("returns 400 for a non-numeric chainId", async () => {
    const res = await GET(
      makeRequest({
        address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
        chainId: "../../1",
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid chainId/i);
  });
});
