import { describe, it, expect } from "vitest";
import { GET } from "../../app/api/token-price/route.js";

const USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const ETH_CHAIN_ID = 1;

function makeRequest(params) {
  const url = new URL("http://localhost/api/token-price");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  return { url: url.toString() };
}

describe("GET /api/token-price (integration)", () => {
  it("returns 400 when token or chainId is missing", async () => {
    const res = await GET(makeRequest({ token: USDC_ADDRESS }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/missing/i);
  });

  it("returns ETH price for native token on Ethereum", async () => {
    const res = await GET(
      makeRequest({
        token: "0x0000000000000000000000000000000000000000",
        chainId: ETH_CHAIN_ID,
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.price).toBeTruthy();
    expect(typeof body.price).toBe("number");
    expect(body.price).toBeGreaterThan(0);
  }, 15000);

  it("returns USDC price on Ethereum", async () => {
    const res = await GET(
      makeRequest({ token: USDC_ADDRESS, chainId: ETH_CHAIN_ID }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.price).toBeTruthy();
    expect(typeof body.price).toBe("number");
    expect(body.price).toBeGreaterThan(0);
  }, 15000);
});
