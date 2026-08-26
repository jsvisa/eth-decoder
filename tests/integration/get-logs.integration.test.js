import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { GET } from "../../app/api/get-logs/route.js";

const USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const hasEtherscanKey = !!process.env.INTEGRATION_ETHERSCAN_API_KEY;

function makeRequest(params) {
  const url = new URL("http://localhost/api/get-logs");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  return { url: url.toString() };
}

describe("GET /api/get-logs (integration)", () => {
  beforeAll(() => {
    if (hasEtherscanKey) {
      process.env.ETHERSCAN_API_KEY = process.env.INTEGRATION_ETHERSCAN_API_KEY;
    }
  });

  afterAll(() => {
    delete process.env.ETHERSCAN_API_KEY;
  });

  it("returns 400 when address is missing", async () => {
    const res = await GET(makeRequest({ chain: "ethereum" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid address/i);
  });

  it("returns 400 when no API key is available", async () => {
    const originalKey = process.env.ETHERSCAN_API_KEY;
    delete process.env.ETHERSCAN_API_KEY;
    try {
      const res = await GET(
        makeRequest({
          address: USDC_ADDRESS,
          chain: "ethereum",
        }),
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/api key/i);
    } finally {
      if (originalKey) process.env.ETHERSCAN_API_KEY = originalKey;
    }
  }, 15000);

  describe("with Etherscan key", () => {
    it.skipIf(!hasEtherscanKey)(
      "fetches Transfer event logs for USDC",
      async () => {
        const res = await GET(
          makeRequest({
            address: USDC_ADDRESS,
            chain: "ethereum",
            topic0: TRANSFER_TOPIC,
            fromBlock: "0",
            toBlock: "latest",
            page: "1",
            offset: "2",
          }),
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.result).toBeTruthy();
        expect(Array.isArray(body.result)).toBe(true);
        expect(body.result.length).toBeGreaterThan(0);
        const log = body.result[0];
        expect(log.address.toLowerCase()).toBe(USDC_ADDRESS.toLowerCase());
        expect(log.topics).toBeDefined();
      },
      15000,
    );
  });
});
