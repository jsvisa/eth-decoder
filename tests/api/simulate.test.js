import { describe, it, expect, vi, afterEach } from "vitest";
import { POST } from "../../app/api/simulate/route.js";

const VALID_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

const TRANSFER_ABI = [
  {
    type: "function",
    name: "transfer",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
];

const TENDERLY_CREDS = {
  tenderlyAccessKey: "test-key",
  tenderlyAccount: "test-account",
  tenderlyProject: "test-project",
};

function makeRequest(body) {
  return { json: async () => body };
}

function makeTenderlyResponse() {
  return {
    transaction: {
      status: true,
      gas_used: 21000,
      transaction_info: {
        call_trace: {
          call_type: "CALL",
          from: "0x0000000000000000000000000000000000000001",
          to: VALID_ADDRESS.toLowerCase(),
          input: "0x",
          output:
            "0x0000000000000000000000000000000000000000000000000000000000000001",
          gas: 8000000,
          gas_used: 21000,
          value: "0",
          calls: [],
        },
        logs: [],
        asset_changes: [],
        balance_changes: [],
      },
    },
    simulation: { state_diff: [] },
  };
}

function stubTenderly(handler) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (url, options) => {
      return handler(url, options);
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/simulate", () => {
  it("returns 400 when required params are missing", async () => {
    const res = await POST(makeRequest({ chain: "ethereum" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/missing required parameters/i);
  });

  it("returns 400 when address format is invalid", async () => {
    const res = await POST(
      makeRequest({
        chain: "ethereum",
        address: "not-an-address",
        functionName: "transfer",
        abi: TRANSFER_ABI,
        ...TENDERLY_CREDS,
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid address/i);
  });

  it("returns 400 when chain is unsupported", async () => {
    const res = await POST(
      makeRequest({
        chain: "unsupported-chain",
        address: VALID_ADDRESS,
        functionName: "transfer",
        abi: TRANSFER_ABI,
        ...TENDERLY_CREDS,
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/unsupported chain/i);
  });

  it("returns 400 when Tenderly credentials are missing", async () => {
    const res = await POST(
      makeRequest({
        chain: "ethereum",
        address: VALID_ADDRESS,
        functionName: "transfer",
        abi: TRANSFER_ABI,
        args: [VALID_ADDRESS, "1000"],
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/tenderly/i);
  });

  it("encodes args and sends calldata to Tenderly", async () => {
    let capturedInput;
    stubTenderly(async (_url, options) => {
      capturedInput = JSON.parse(options.body).input;
      return { ok: true, json: async () => makeTenderlyResponse() };
    });

    const res = await POST(
      makeRequest({
        chain: "ethereum",
        address: VALID_ADDRESS,
        functionName: "transfer",
        abi: TRANSFER_ABI,
        args: [VALID_ADDRESS, "1000"],
        ...TENDERLY_CREDS,
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.simulated).toBe(true);
    expect(body.success).toBe(true);
    // transfer(address,uint256) selector is 0xa9059cbb
    expect(capturedInput).toMatch(/^0xa9059cbb/);
  });

  it("passes raw callData directly to Tenderly, bypassing arg encoding", async () => {
    // Pre-encoded transfer(VALID_ADDRESS, 100) — selector 0xa9059cbb
    const rawCalldata =
      "0xa9059cbb000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb480000000000000000000000000000000000000000000000000000000000000064";
    let capturedInput;
    stubTenderly(async (_url, options) => {
      capturedInput = JSON.parse(options.body).input;
      return { ok: true, json: async () => makeTenderlyResponse() };
    });

    const res = await POST(
      makeRequest({
        chain: "ethereum",
        address: VALID_ADDRESS,
        functionName: "transfer",
        abi: TRANSFER_ABI,
        callData: rawCalldata,
        ...TENDERLY_CREDS,
      }),
    );

    expect(res.status).toBe(200);
    expect(capturedInput).toBe(rawCalldata);
  });
});
