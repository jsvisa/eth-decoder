import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "../../app/api/simulate-tx/route.js";

// Minimal ABI matching selector 0x5e7db13d = unlockAsset(address,uint256)
const UNLOCK_ABI = [
  {
    type: "function",
    name: "unlockAsset",
    inputs: [
      { name: "_asset", type: "address" },
      { name: "_lockIndex", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
];

const CACHE_ENTRY = {
  abi: UNLOCK_ABI,
  isProxy: false,
  implAddress: null,
  contractName: "TokenLocker",
  implContractName: null,
  fetchedAt: 1719360000000,
};

const VALID_BODY = {
  chainId: 1,
  to: "0x99161BA892ECae335616624c84FAA418F64FF9A6",
  data: "0x5e7db13d000000000000000000000000e556aba6fe6036275ec1f87eda296be72c811bce0000000000000000000000000000000000000000000000000000000000000001",
  from: "0xd719fc03782E9617e81D138a3e9B1875da4D6a03",
  value: "0x0",
  blockNumber: "latest",
};

const SIM_RESULT = {
  success: true,
  simulated: true,
  localSimulation: true,
  blockNumber: "latest",
  rawData: "0x",
  decoded: [],
  gasUsed: 63086,
  logs: [],
  callTrace: null,
  assetChanges: [],
  balanceChanges: [],
  stateChanges: [],
  accessList: [],
  error: null,
  undecodedAddresses: [],
  metrics: {},
};

const FAKE_SIMULATION_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

vi.mock("../../app/api/fetch-abi/route.js", () => ({
  fetchAbi: vi.fn(),
}));
vi.mock("../../app/utils/serverAbiCache.js", () => ({
  getAbiFromCache: vi.fn(),
  setAbiInCache: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../app/utils/tevmSimulator.js", () => ({
  simulateWithTevm: vi.fn(),
}));
vi.mock("../../app/utils/simulationCache.js");

import { fetchAbi } from "../../app/api/fetch-abi/route.js";
import {
  getAbiFromCache,
  setAbiInCache,
} from "../../app/utils/serverAbiCache.js";
import { simulateWithTevm } from "../../app/utils/tevmSimulator.js";
import {
  saveSimulationResult,
  pruneExpiredResults,
} from "../../app/utils/simulationCache.js";

function makeRequest(body) {
  return { json: async () => body };
}

beforeEach(() => {
  vi.clearAllMocks();
  getAbiFromCache.mockResolvedValue(null);
  fetchAbi.mockResolvedValue({ ...CACHE_ENTRY });
  simulateWithTevm.mockResolvedValue(SIM_RESULT);
  saveSimulationResult.mockResolvedValue(FAKE_SIMULATION_ID);
  pruneExpiredResults.mockResolvedValue(0);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/simulate-tx — validation", () => {
  it("returns 400 when chainId is missing", async () => {
    const { chainId: _, ...body } = VALID_BODY;
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/chainid/i);
  });

  it("returns 400 when to is missing", async () => {
    const { to: _, ...body } = VALID_BODY;
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/to/i);
  });

  it("returns 400 when data is missing", async () => {
    const { data: _, ...body } = VALID_BODY;
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/data/i);
  });

  it("returns 400 when from is missing", async () => {
    const { from: _, ...body } = VALID_BODY;
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/from/i);
  });

  it("returns 400 for an unsupported chainId without rpcUrl", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, chainId: 999999 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/unsupported chainid/i);
  });

  it("returns 200 for non-builtin chainId when rpcUrl is provided", async () => {
    const res = await POST(
      makeRequest({
        ...VALID_BODY,
        chainId: 999999,
        rpcUrl: "https://custom-rpc.example.com",
      }),
    );
    expect(res.status).toBe(200);
  });

  it("passes custom rpcUrl and customChainId to simulateWithTevm for non-builtin chain", async () => {
    const customRpc = "https://custom-rpc.example.com";
    await POST(
      makeRequest({ ...VALID_BODY, chainId: 999999, rpcUrl: customRpc }),
    );
    expect(simulateWithTevm).toHaveBeenCalledWith(
      expect.objectContaining({
        rpcUrl: customRpc,
        customChainId: 999999,
      }),
    );
  });

  it("passes custom rpcUrl to simulateWithTevm when provided", async () => {
    const customRpc = "https://custom-rpc.example.com";
    await POST(makeRequest({ ...VALID_BODY, rpcUrl: customRpc }));
    expect(simulateWithTevm).toHaveBeenCalledWith(
      expect.objectContaining({
        rpcUrl: customRpc,
      }),
    );
  });

  it("uses default FORK_RPC_URL when custom rpcUrl is not provided", async () => {
    await POST(makeRequest(VALID_BODY));
    expect(simulateWithTevm).toHaveBeenCalledWith(
      expect.objectContaining({
        rpcUrl: expect.stringContaining("publicnode"),
      }),
    );
    expect(simulateWithTevm).toHaveBeenCalledWith(
      expect.not.objectContaining({
        customChainId: expect.anything(),
      }),
    );
  });

  it("returns 400 for invalid gas format", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, gas: "abc" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/gas/i);
  });

  it("accepts valid hex gas", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, gas: "0x5208" }));
    expect(res.status).toBe(200);
  });

  it("accepts valid decimal gas", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, gas: "21000" }));
    expect(res.status).toBe(200);
  });

  it("returns 400 for invalid blockNumber format", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, blockNumber: "abc" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/blocknumber/i);
  });

  it("accepts latest as blockNumber", async () => {
    const res = await POST(
      makeRequest({ ...VALID_BODY, blockNumber: "latest" }),
    );
    expect(res.status).toBe(200);
  });

  it("accepts valid decimal blockNumber", async () => {
    const res = await POST(
      makeRequest({ ...VALID_BODY, blockNumber: "12345" }),
    );
    expect(res.status).toBe(200);
  });

  it("accepts valid hex blockNumber", async () => {
    const res = await POST(
      makeRequest({ ...VALID_BODY, blockNumber: "0x1a2b3c" }),
    );
    expect(res.status).toBe(200);
  });

  it("returns 400 for invalid to address", async () => {
    const res = await POST(
      makeRequest({ ...VALID_BODY, to: "not-an-address" }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/to/i);
  });

  it("returns 400 for invalid from address", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, from: "invalid" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/from/i);
  });

  it("returns 400 for invalid value format", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, value: "0xZZ" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/value/i);
  });
});

describe("POST /api/simulate-tx — ABI resolution", () => {
  it("returns 422 when ABI cannot be fetched", async () => {
    fetchAbi.mockResolvedValue(null);
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/abi not found/i);
  });

  it("uses the cached ABI on a cache hit and skips fetchAbi", async () => {
    getAbiFromCache.mockResolvedValue(CACHE_ENTRY);
    await POST(makeRequest(VALID_BODY));
    expect(fetchAbi).not.toHaveBeenCalled();
    expect(setAbiInCache).not.toHaveBeenCalled();
  });

  it("fetches ABI and saves to cache on a cache miss", async () => {
    await POST(makeRequest(VALID_BODY));
    expect(fetchAbi).toHaveBeenCalledOnce();
    expect(setAbiInCache).toHaveBeenCalledOnce();
    const [chainId, address, entry] = setAbiInCache.mock.calls[0];
    expect(chainId).toBe(1);
    expect(address.toLowerCase()).toBe(VALID_BODY.to.toLowerCase());
    expect(entry.abi).toEqual(UNLOCK_ABI);
    expect(typeof entry.fetchedAt).toBe("number");
  });

  it("passes apiKeys from the request to fetchAbi", async () => {
    const apiKeys = { etherscan: "MY_KEY", routescan: "MY_RS" };
    await POST(makeRequest({ ...VALID_BODY, apiKeys }));
    expect(fetchAbi).toHaveBeenCalledWith(
      VALID_BODY.to,
      1,
      expect.objectContaining({
        etherscanKey: "MY_KEY",
        routescanKey: "MY_RS",
      }),
    );
  });
});

describe("POST /api/simulate-tx — simulation", () => {
  it("calls simulateWithTevm with the correct params", async () => {
    await POST(makeRequest(VALID_BODY));
    expect(simulateWithTevm).toHaveBeenCalledWith(
      expect.objectContaining({
        chain: "ethereum",
        address: VALID_BODY.to,
        functionName: "unlockAsset",
        callData: VALID_BODY.data,
        fromAddress: VALID_BODY.from,
        value: "0",
        valueUnit: "Wei",
        blockNumber: "latest",
      }),
    );
  });

  it("returns 200 with the simulation result on success", async () => {
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.gasUsed).toBe(63086);
  });

  it("includes simulationId and requestBody in the response", async () => {
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.simulationId).toBe(FAKE_SIMULATION_ID);
    expect(body.requestBody).toBeDefined();
    expect(body.requestBody.chainId).toBe(1);
    expect(body.requestBody.to).toBe(VALID_BODY.to);
  });

  it("caches the simulation result via saveSimulationResult", async () => {
    await POST(makeRequest(VALID_BODY));
    expect(saveSimulationResult).toHaveBeenCalledOnce();
    const saved = saveSimulationResult.mock.calls[0][0];
    expect(saved.success).toBe(true);
    expect(saved.requestBody).toBeDefined();
    expect(saved.requestBody.chainId).toBe(1);
  });

  it("returns 200 with success:false when the EVM reverts", async () => {
    simulateWithTevm.mockResolvedValue({
      ...SIM_RESULT,
      success: false,
      error: "Transaction reverted",
    });
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Transaction reverted");
  });

  it("includes simulationId even when the EVM reverts", async () => {
    simulateWithTevm.mockResolvedValue({
      ...SIM_RESULT,
      success: false,
      error: "Transaction reverted",
    });
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.simulationId).toBe(FAKE_SIMULATION_ID);
  });

  it("returns 500 when simulateWithTevm throws", async () => {
    simulateWithTevm.mockRejectedValue(new Error("tevm internal error"));
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/tevm internal error/i);
  });

  it("includes simulationId even when simulateWithTevm throws", async () => {
    simulateWithTevm.mockRejectedValue(new Error("tevm internal error"));
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.simulationId).toBe(FAKE_SIMULATION_ID);
    expect(body.success).toBe(false);
  });

  it("returns 400 for invalid JSON body", async () => {
    const res = await POST({
      json: async () => {
        throw new Error("Unexpected token");
      },
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/invalid json/i);
  });

  it("normalizes hex value to decimal string", async () => {
    await POST(makeRequest({ ...VALID_BODY, value: "0xe10" }));
    expect(simulateWithTevm).toHaveBeenCalledWith(
      expect.objectContaining({ value: "3600" }),
    );
  });

  it("normalizes decimal value to string", async () => {
    await POST(makeRequest({ ...VALID_BODY, value: "1000000" }));
    expect(simulateWithTevm).toHaveBeenCalledWith(
      expect.objectContaining({ value: "1000000" }),
    );
  });

  it("defaults value to 0 when not provided", async () => {
    const { value: _, ...body } = VALID_BODY;
    await POST(makeRequest(body));
    expect(simulateWithTevm).toHaveBeenCalledWith(
      expect.objectContaining({ value: "0" }),
    );
  });

  it("normalizes hex gas to decimal string", async () => {
    await POST(makeRequest({ ...VALID_BODY, gas: "0x5208" }));
    expect(simulateWithTevm).toHaveBeenCalledWith(
      expect.objectContaining({ gas: "21000" }),
    );
  });

  it("normalizes decimal gas to string", async () => {
    await POST(makeRequest({ ...VALID_BODY, gas: "100000" }));
    expect(simulateWithTevm).toHaveBeenCalledWith(
      expect.objectContaining({ gas: "100000" }),
    );
  });

  it("passes null gas when not provided", async () => {
    await POST(makeRequest(VALID_BODY));
    expect(simulateWithTevm).toHaveBeenCalledWith(
      expect.objectContaining({ gas: null }),
    );
  });

  it("normalizes hex blockNumber to decimal string", async () => {
    await POST(makeRequest({ ...VALID_BODY, blockNumber: "0x1a2b3c" }));
    expect(simulateWithTevm).toHaveBeenCalledWith(
      expect.objectContaining({ blockNumber: "1715004" }),
    );
  });

  it("normalizes decimal blockNumber to string", async () => {
    await POST(makeRequest({ ...VALID_BODY, blockNumber: "12345" }));
    expect(simulateWithTevm).toHaveBeenCalledWith(
      expect.objectContaining({ blockNumber: "12345" }),
    );
  });

  it("keeps latest as-is for blockNumber", async () => {
    await POST(makeRequest({ ...VALID_BODY, blockNumber: "latest" }));
    expect(simulateWithTevm).toHaveBeenCalledWith(
      expect.objectContaining({ blockNumber: "latest" }),
    );
  });

  it("returns 422 when calldata does not match the ABI", async () => {
    const mismatchData = "0xdeadbeef";
    const res = await POST(makeRequest({ ...VALID_BODY, data: mismatchData }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/failed to decode calldata/i);
  });

  it("returns 422 when fetchAbi returns an entry without abi", async () => {
    fetchAbi.mockResolvedValue({ abi: null, isProxy: false });
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/abi not found/i);
  });

  it("passes address as-is to cache lookup", async () => {
    const mixedCase = "0x99161ba892ECae335616624c84FAA418F64FF9A6";
    await POST(makeRequest({ ...VALID_BODY, to: mixedCase }));
    expect(getAbiFromCache).toHaveBeenCalledWith(1, mixedCase);
  });
});
