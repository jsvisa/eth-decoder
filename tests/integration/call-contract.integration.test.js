import { describe, it, expect } from "vitest";
import { POST } from "../../app/api/call-contract/route.js";

const USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const VITALIK = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

const USDC_ABI = [
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "totalSupply",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "decimals",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "symbol",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
  },
];

const hasRpcUrl = !!process.env.INTEGRATION_RPC_URL;

function makeRequest(body) {
  return {
    json: async () => body,
  };
}

describe("POST /api/call-contract (integration)", () => {
  it("returns 400 when required params are missing", async () => {
    const res = await POST(makeRequest({ chain: "ethereum" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/missing required/i);
  });

  it("returns 400 for invalid address", async () => {
    const res = await POST(
      makeRequest({
        chain: "ethereum",
        address: "0xinvalid",
        functionName: "balanceOf",
        args: [VITALIK],
        abi: USDC_ABI,
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid address/i);
  });

  it("returns 400 when function is not found in ABI", async () => {
    const res = await POST(
      makeRequest({
        chain: "ethereum",
        address: USDC_ADDRESS,
        functionName: "nonexistent",
        args: [],
        abi: USDC_ABI,
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/not found in ABI/i);
  });

  it("returns 400 for unsupported chain", async () => {
    const res = await POST(
      makeRequest({
        chain: "nonexistent",
        address: USDC_ADDRESS,
        functionName: "balanceOf",
        args: [VITALIK],
        abi: USDC_ABI,
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/unsupported chain/i);
  });

  describe("with RPC URL", () => {
    it.skipIf(!hasRpcUrl)(
      "calls balanceOf on USDC via custom RPC URL",
      async () => {
        const res = await POST(
          makeRequest({
            chain: "ethereum",
            address: USDC_ADDRESS,
            functionName: "balanceOf",
            args: [VITALIK],
            abi: USDC_ABI,
            rpcUrl: process.env.INTEGRATION_RPC_URL,
          }),
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.rawData).toBeTruthy();
        expect(body.decoded).toBeTruthy();
        expect(body.decoded.length).toBe(1);
        expect(body.decoded[0].name).toBe("result");
        expect(body.decoded[0].type).toBe("uint256");
        expect(typeof body.decoded[0].value).toBe("string");
      },
      15000,
    );

    it.skipIf(!hasRpcUrl)(
      "calls totalSupply on USDC",
      async () => {
        const res = await POST(
          makeRequest({
            chain: "ethereum",
            address: USDC_ADDRESS,
            functionName: "totalSupply",
            args: [],
            abi: USDC_ABI,
            rpcUrl: process.env.INTEGRATION_RPC_URL,
          }),
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.rawData).toBeTruthy();
        expect(body.decoded).toBeTruthy();
        expect(body.decoded[0].type).toBe("uint256");
        expect(typeof body.decoded[0].value).toBe("string");
      },
      15000,
    );

    it.skipIf(!hasRpcUrl)(
      "calls decimals on USDC",
      async () => {
        const res = await POST(
          makeRequest({
            chain: "ethereum",
            address: USDC_ADDRESS,
            functionName: "decimals",
            args: [],
            abi: USDC_ABI,
            rpcUrl: process.env.INTEGRATION_RPC_URL,
          }),
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.decoded).toBeTruthy();
        expect(body.decoded[0].value).toBe(6);
      },
      15000,
    );

    it.skipIf(!hasRpcUrl)(
      "calls symbol on USDC",
      async () => {
        const res = await POST(
          makeRequest({
            chain: "ethereum",
            address: USDC_ADDRESS,
            functionName: "symbol",
            args: [],
            abi: USDC_ABI,
            rpcUrl: process.env.INTEGRATION_RPC_URL,
          }),
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.decoded).toBeTruthy();
        expect(body.decoded[0].value).toBe("USDC");
      },
      15000,
    );

    it.skipIf(!hasRpcUrl)(
      "returns error for unsupported chain",
      async () => {
        const res = await POST(
          makeRequest({
            chain: "nonexistent",
            address: USDC_ADDRESS,
            functionName: "balanceOf",
            args: [VITALIK],
            abi: USDC_ABI,
          }),
        );
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/unsupported chain/i);
      },
      15000,
    );
  });
});
