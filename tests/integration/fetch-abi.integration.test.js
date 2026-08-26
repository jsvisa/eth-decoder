import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { POST } from "../../app/api/fetch-abi/route.js";

const USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const CHAIN = "ethereum";

const hasEtherscanKey = !!process.env.INTEGRATION_ETHERSCAN_API_KEY;

function makeRequest(body) {
  return {
    json: async () => body,
  };
}

describe("POST /api/fetch-abi (integration)", () => {
  beforeAll(() => {
    if (hasEtherscanKey) {
      process.env.ETHERSCAN_API_KEY = process.env.INTEGRATION_ETHERSCAN_API_KEY;
    }
  });

  afterAll(() => {
    delete process.env.ETHERSCAN_API_KEY;
  });

  it("returns 400 when required params are missing", async () => {
    const res = await POST(makeRequest({ chain: CHAIN }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/address/i);
  });

  describe("with Etherscan key", () => {
    it.skipIf(!hasEtherscanKey)(
      "fetches ABI for a verified contract",
      async () => {
        const res = await POST(
          makeRequest({
            chain: CHAIN,
            address: USDC_ADDRESS,
          }),
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.abi).toBeTruthy();
        expect(Array.isArray(body.abi)).toBe(true);
        expect(body.abi.length).toBeGreaterThan(0);
        const hasTransfer = body.abi.some(
          (item) => item.type === "function" && item.name === "transfer",
        );
        expect(hasTransfer).toBe(true);
      },
      15000,
    );

    it.skipIf(!hasEtherscanKey)(
      "fetches ABI with source code",
      async () => {
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
      },
      15000,
    );

    it.skipIf(!hasEtherscanKey)(
      "returns error for unverified contract",
      async () => {
        const res = await POST(
          makeRequest({
            chain: CHAIN,
            address: "0x0000000000000000000000000000000000000001",
          }),
        );
        expect(res.status).not.toBe(200);
      },
      15000,
    );
  });
});
