import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "../../app/api/token-price/route.js";

const ETH = "0x0000000000000000000000000000000000000000";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

function makeRequest(params) {
  const url = new URL("http://localhost/api/token-price");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  return { url: url.toString() };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /api/token-price", () => {
  it("returns 400 when token param is missing", async () => {
    const res = await GET(makeRequest({ chainId: 1 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/missing/i);
  });

  it("returns 400 when chainId param is missing", async () => {
    const res = await GET(makeRequest({ token: USDC }));
    expect(res.status).toBe(400);
  });

  it("returns { price: null } for an unsupported chain", async () => {
    const res = await GET(makeRequest({ token: USDC, chainId: 999999 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.price).toBeNull();
  });

  it("returns price for native ETH on Ethereum", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ethereum: { usd: 3000 } }),
    });
    const res = await GET(makeRequest({ token: ETH, chainId: 1 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.price).toBe(3000);
  });

  it("returns price for an ERC-20 token on Ethereum", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        [USDC.toLowerCase()]: { usd: 1.0 },
      }),
    });
    const res = await GET(makeRequest({ token: USDC, chainId: 1 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.price).toBe(1.0);
  });

  it("returns { price: null } when CoinGecko returns non-OK", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 429 });
    const res = await GET(makeRequest({ token: USDC, chainId: 1 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.price).toBeNull();
  });

  it("returns { price: null } when CoinGecko fetch throws", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("timeout"));
    const res = await GET(makeRequest({ token: USDC, chainId: 1 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.price).toBeNull();
  });
});
