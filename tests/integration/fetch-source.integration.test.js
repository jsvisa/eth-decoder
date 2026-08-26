import { describe, it, expect } from "vitest";
import { POST } from "../../app/api/fetch-source/route.js";

const USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const CHAIN = "ethereum";

function makeRequest(body) {
  return {
    json: async () => body,
  };
}

describe("POST /api/fetch-source (integration)", () => {
  it("returns 400 when address is missing", async () => {
    const res = await POST(makeRequest({ chain: CHAIN }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/address/i);
  });

  it("returns 400 for invalid address", async () => {
    const res = await POST(makeRequest({ chain: CHAIN, address: "0xinvalid" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid address/i);
  });

  it("fetches source code for USDC via Sourcify", async () => {
    const res = await POST(
      makeRequest({
        chain: CHAIN,
        address: USDC_ADDRESS,
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sourceCode).toBeTruthy();
    expect(typeof body.sourceCode).toBe("object");
    expect(Object.keys(body.sourceCode).length).toBeGreaterThan(0);
  }, 15000);

  it("returns 404 for unverified contract", async () => {
    const res = await POST(
      makeRequest({
        chain: CHAIN,
        address: "0x0000000000000000000000000000000000000001",
      }),
    );
    expect(res.status).toBe(404);
  }, 15000);
});
