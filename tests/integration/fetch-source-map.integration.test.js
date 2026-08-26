import { describe, it, expect } from "vitest";
import { GET } from "../../app/api/fetch-source-map/route.js";

const USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const CHAIN_ID = "1";

function makeRequest(params) {
  const url = new URL("http://localhost/api/fetch-source-map");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  return { url: url.toString() };
}

describe("GET /api/fetch-source-map (integration)", () => {
  it("returns 400 when address is missing", async () => {
    const res = await GET(makeRequest({ chainId: CHAIN_ID }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/missing address/i);
  });

  it("returns 400 when chainId is missing", async () => {
    const res = await GET(makeRequest({ address: USDC_ADDRESS }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/missing chainId/i);
  });

  it.skip("returns sourceMap and sources for a Sourcify-verified contract", async () => {
    const res = await GET(
      makeRequest({ address: USDC_ADDRESS, chainId: CHAIN_ID }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sourceMap).toBeTruthy();
    expect(typeof body.sourceMap).toBe("string");
    expect(body.sources).toBeTruthy();
    expect(typeof body.sources).toBe("object");
    expect(Object.keys(body.sources).length).toBeGreaterThan(0);
  }, 15000);

  it("returns 404 for an unverified contract", async () => {
    const res = await GET(
      makeRequest({
        address: "0x0000000000000000000000000000000000000001",
        chainId: CHAIN_ID,
      }),
    );
    expect(res.status).toBe(404);
  }, 15000);
});
