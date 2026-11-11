import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const VIEM_MOCKS = vi.hoisted(() => {
  const readContract = vi.fn();
  return {
    readContract,
    createPublicClient: vi.fn(() => ({ readContract })),
    http: vi.fn((url) => ({ url })),
  };
});

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    createPublicClient: VIEM_MOCKS.createPublicClient,
    http: VIEM_MOCKS.http,
  };
});

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

const CREATE_INIT_CODE = "0x600a600c600039600a6000f3602a60005260206000f3";
const CREATED_ADDRESS = "0x1234567890123456789012345678901234567890";

const SIM_RESULT = {
  success: true,
  simulated: true,
  blockNumber: "latest",
  rawData: "0x",
  decoded: [],
  gasUsed: 63086,
  logs: [],
  callTrace: null,
  balanceChanges: [],
  stateChanges: [],
  accessList: [],
  error: null,
  undecodedAddresses: [],
  metrics: {},
};

const FAKE_SIMULATION_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const USDT_ADDRESS = "0xdAC17F958D2ee523a2206206994597C13D831ec7";

vi.mock("../../app/utils/fetchContract.js", () => ({
  fetchAbi: vi.fn(),
}));
vi.mock("../../app/utils/serverAbiBlobCache.js", () => ({
  getAbiFromCache: vi.fn(),
  setAbiInCache: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../app/utils/tevmSimulator.js", () => ({
  simulateWithTevm: vi.fn(),
  simulateWithClient: vi.fn(),
  createTevmClient: vi.fn(),
  collectAllCallAddresses: vi.fn(() => []),
}));
vi.mock("../../app/utils/simulationCache.js");
vi.mock("../../app/utils/coingecko.js", () => ({
  fetchCoinGeckoPrice: vi.fn().mockResolvedValue(null),
}));
vi.mock("../../app/utils/traceSourceLines.js", async (importOriginal) => ({
  ...(await importOriginal()),
  resolveTraceSourceLinesForSave: vi.fn(),
}));

import { POST } from "../../app/api/simulate-tx/route.js";

import { fetchAbi } from "../../app/api/fetch-abi/route.js";
import {
  getAbiFromCache,
  setAbiInCache,
} from "../../app/utils/serverAbiBlobCache.js";
import { simulateWithTevm } from "../../app/utils/tevmSimulator.js";
import {
  simulateWithClient,
  createTevmClient,
} from "../../app/utils/tevmSimulator.js";
import {
  saveSimulationResult,
  pruneExpiredResults,
} from "../../app/utils/simulationCache.js";
import { resolveTraceSourceLinesForSave } from "../../app/utils/traceSourceLines.js";
import { fetchCoinGeckoPrice } from "../../app/utils/coingecko.js";

function makeRequest(body) {
  return {
    url: "https://eth-decoder.vercel.app/api/simulate-tx",
    json: async () => body,
    headers: new Map(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getAbiFromCache.mockResolvedValue(null);
  fetchAbi.mockResolvedValue({ ...CACHE_ENTRY });
  simulateWithTevm.mockResolvedValue(SIM_RESULT);
  simulateWithClient.mockResolvedValue(SIM_RESULT);
  createTevmClient.mockResolvedValue({
    client: { tevmReady: async () => {} },
    blockNumber: "latest",
  });
  saveSimulationResult.mockResolvedValue(FAKE_SIMULATION_ID);
  pruneExpiredResults.mockResolvedValue(0);
  VIEM_MOCKS.createPublicClient.mockReturnValue({
    readContract: VIEM_MOCKS.readContract,
  });
  VIEM_MOCKS.http.mockImplementation((url) => ({ url }));
  VIEM_MOCKS.readContract.mockImplementation(async ({ functionName }) => {
    if (functionName === "symbol") return "USDT";
    if (functionName === "decimals") return 6;
    return null;
  });
  fetchCoinGeckoPrice.mockResolvedValue(null);
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

  it("accepts a missing to as CREATE", async () => {
    const { to: _, ...body } = VALID_BODY;
    const res = await POST(makeRequest({ ...body, data: CREATE_INIT_CODE }));
    expect(res.status).toBe(200);
  });

  it("accepts a null to as CREATE", async () => {
    const res = await POST(
      makeRequest({ ...VALID_BODY, to: null, data: CREATE_INIT_CODE }),
    );
    expect(res.status).toBe(200);
  });

  it("accepts an empty string to as CREATE", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, to: "" }));
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
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

  it("returns 400 when session-mode calls exceed the 20-call cap", async () => {
    const manyCalls = Array.from({ length: 21 }, () => ({
      to: VALID_BODY.to,
      data: VALID_BODY.data,
      from: VALID_BODY.from,
    }));
    const res = await POST(makeRequest({ ...VALID_BODY, calls: manyCalls }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/at most 20/i);
  });

  it("accepts 20 session calls (the cap boundary)", async () => {
    simulateWithClient.mockResolvedValue(SIM_RESULT);
    const calls = Array.from({ length: 20 }, () => ({
      to: VALID_BODY.to,
      data: VALID_BODY.data,
      from: VALID_BODY.from,
    }));
    const res = await POST(makeRequest({ ...VALID_BODY, calls }));
    expect(res.status).toBe(200);
  });

  it("returns 400 when rpcUrl points at a private address (SSRF)", async () => {
    delete process.env.ALLOW_PRIVATE_RPC;
    const res = await POST(
      makeRequest({ ...VALID_BODY, rpcUrl: "http://127.0.0.1:8545" }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/rpcUrl/i);
  });

  it("returns 200 for non-builtin chainId when rpcUrl is provided", async () => {
    const res = await POST(
      makeRequest({
        ...VALID_BODY,
        chainId: 999999,
        rpcUrl: "https://203.0.113.10",
      }),
    );
    expect(res.status).toBe(200);
  });

  it("passes custom rpcUrl and customChainId to simulateWithTevm for non-builtin chain", async () => {
    const customRpc = "https://203.0.113.10";
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
    const customRpc = "https://203.0.113.10";
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

  it("returns 400 when data is not a 0x-prefixed hex string", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, data: "not-hex" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/data/i);
  });

  it("returns 400 when data contains non-hex characters", async () => {
    const res = await POST(
      makeRequest({
        ...VALID_BODY,
        data: `0x${"5e7db13d".slice(0, 8)}zz`,
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/data/i);
  });

  it("accepts empty 0x calldata", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, data: "0x" }));
    expect(res.status).toBe(200);
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
  it("proceeds with simulation when ABI cannot be fetched", async () => {
    fetchAbi.mockResolvedValue(null);
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.simulated).toBe(true);
    expect(simulateWithTevm).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: null, abi: null }),
    );
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

  it("decode: false skips ABI lookups but still simulates", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, decode: false }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.simulated).toBe(true);
    expect(getAbiFromCache).not.toHaveBeenCalled();
    expect(fetchAbi).not.toHaveBeenCalled();
    expect(setAbiInCache).not.toHaveBeenCalled();
    expect(simulateWithTevm).toHaveBeenCalledOnce();
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
        isCreate: false,
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

  it("simulates CREATE without resolving a target ABI", async () => {
    simulateWithTevm.mockResolvedValue({
      ...SIM_RESULT,
      createdAddress: CREATED_ADDRESS,
    });
    const { to: _, ...body } = VALID_BODY;
    const res = await POST(makeRequest({ ...body, data: CREATE_INIT_CODE }));

    expect(res.status).toBe(200);
    expect(fetchAbi).not.toHaveBeenCalled();
    expect(getAbiFromCache).not.toHaveBeenCalled();
    expect(simulateWithTevm).toHaveBeenCalledWith(
      expect.objectContaining({
        isCreate: true,
        address: null,
        callData: CREATE_INIT_CODE,
        functionName: null,
        abi: null,
      }),
    );
    expect((await res.json()).createdAddress).toBe(CREATED_ADDRESS);
  });

  it("returns 200 with the simulation result on success", async () => {
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.gasUsed).toBe(63086);
  });

  it("omits metrics by default", async () => {
    simulateWithTevm.mockResolvedValue({
      ...SIM_RESULT,
      metrics: { totalMs: 123, rpc: {}, phases: {}, touched: {} },
    });
    const res = await POST(makeRequest(VALID_BODY));
    const body = await res.json();
    expect(body.metrics).toBeUndefined();
  });

  it("includes metrics when includeMetrics: true", async () => {
    simulateWithTevm.mockResolvedValue({
      ...SIM_RESULT,
      metrics: { totalMs: 123, rpc: {}, phases: {}, touched: {} },
    });
    const res = await POST(
      makeRequest({ ...VALID_BODY, includeMetrics: true }),
    );
    const body = await res.json();
    expect(body.metrics).toEqual({
      totalMs: 123,
      rpc: {},
      phases: {},
      touched: {},
    });
  });

  it("includes simulationId and requestBody when save: true", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, save: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.simulationId).toBe(FAKE_SIMULATION_ID);
    expect(body.simulationLink).toBe(
      `https://eth-decoder.vercel.app/?simulationId=${FAKE_SIMULATION_ID}`,
    );
    expect(body.requestBody).toBeDefined();
    expect(body.requestBody.chainId).toBe(1);
    expect(body.requestBody.to).toBe(VALID_BODY.to);
  });

  it("does not include simulationId when save is not provided", async () => {
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.simulationId).toBeUndefined();
    expect(body.simulationLink).toBeUndefined();
  });

  it("does not call saveSimulationResult when save is not provided", async () => {
    await POST(makeRequest(VALID_BODY));
    expect(saveSimulationResult).not.toHaveBeenCalled();
  });

  it("saves the full result for shared lookup when save: true", async () => {
    await POST(makeRequest({ ...VALID_BODY, save: true }));
    expect(saveSimulationResult).toHaveBeenCalledOnce();
    const saved = saveSimulationResult.mock.calls[0][0];
    expect(saved.success).toBe(true);
    expect(saved.requestBody).toBeDefined();
    expect(saved.requestBody.chainId).toBe(1);
  });

  it("preserves decoded call arguments in the response and saved result", async () => {
    simulateWithTevm.mockImplementation(async ({ args }) => ({
      ...SIM_RESULT,
      callTrace: {
        functionName: "unlockAsset",
        decodedInputs: UNLOCK_ABI[0].inputs.map((input, index) => ({
          name: input.name,
          type: input.type,
          value: args?.[index] == null ? null : String(args[index]),
        })),
      },
    }));

    const res = await POST(makeRequest({ ...VALID_BODY, save: true }));
    const body = await res.json();
    const traceArgs = body.callTrace.decodedInputs.map(({ value }) => value);
    const savedArgs = saveSimulationResult.mock.calls[0][0].requestBody.args;

    expect(traceArgs[0].toLowerCase()).toBe(
      "0xe556aba6fe6036275ec1f87eda296be72c811bce",
    );
    expect(traceArgs[1]).toBe("1");
    expect(body.requestBody.args[0].toLowerCase()).toBe(
      "0xe556aba6fe6036275ec1f87eda296be72c811bce",
    );
    expect(body.requestBody.args[1]).toBe("1");
    expect(savedArgs[0].toLowerCase()).toBe(
      "0xe556aba6fe6036275ec1f87eda296be72c811bce",
    );
    expect(savedArgs[1]).toBe("1");
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

  it("includes simulationId even when the EVM reverts if save: true", async () => {
    simulateWithTevm.mockResolvedValue({
      ...SIM_RESULT,
      success: false,
      error: "Transaction reverted",
    });
    const res = await POST(makeRequest({ ...VALID_BODY, save: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.simulationId).toBe(FAKE_SIMULATION_ID);
  });

  it("does not include simulationId on revert when save is not provided", async () => {
    simulateWithTevm.mockResolvedValue({
      ...SIM_RESULT,
      success: false,
      error: "Transaction reverted",
    });
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.simulationId).toBeUndefined();
  });

  it("returns 500 when simulateWithTevm throws", async () => {
    simulateWithTevm.mockRejectedValue(new Error("tevm internal error"));
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/tevm internal error/i);
  });

  it("includes simulationId on throw if save: true", async () => {
    simulateWithTevm.mockRejectedValue(new Error("tevm internal error"));
    const res = await POST(makeRequest({ ...VALID_BODY, save: true }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.simulationId).toBe(FAKE_SIMULATION_ID);
    expect(body.simulationLink).toBe(
      `https://eth-decoder.vercel.app/?simulationId=${FAKE_SIMULATION_ID}`,
    );
    expect(body.success).toBe(false);
  });

  it("does not include simulationId on throw when save is not provided", async () => {
    simulateWithTevm.mockRejectedValue(new Error("tevm internal error"));
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.simulationId).toBeUndefined();
    expect(body.simulationLink).toBeUndefined();
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

  it("proceeds with simulation when calldata does not match the ABI", async () => {
    const mismatchData = "0xdeadbeef";
    const res = await POST(makeRequest({ ...VALID_BODY, data: mismatchData }));
    expect(res.status).toBe(200);
    expect(simulateWithTevm).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: null }),
    );
  });

  it("proceeds with simulation when fetchAbi returns an entry without abi", async () => {
    fetchAbi.mockResolvedValue({ abi: null, isProxy: false });
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.simulated).toBe(true);
    expect(simulateWithTevm).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: null, abi: null }),
    );
  });

  it("passes address as-is to cache lookup", async () => {
    const mixedCase = "0x99161ba892ECae335616624c84FAA418F64FF9A6";
    await POST(makeRequest({ ...VALID_BODY, to: mixedCase }));
    expect(getAbiFromCache).toHaveBeenCalledWith(1, mixedCase);
  });

  it("uses the default fork RPC for token metadata when rpcUrl is omitted", async () => {
    const recipient = "0x1111111111111111111111111111111111111111";
    simulateWithTevm.mockResolvedValue({
      ...SIM_RESULT,
      logs: [
        {
          address: USDT_ADDRESS,
          topics: [
            TRANSFER_TOPIC,
            `0x${"0".repeat(24)}${VALID_BODY.from.slice(2).toLowerCase()}`,
            `0x${"0".repeat(24)}${recipient.slice(2)}`,
          ],
          data: "0x00000000000000000000000000000000000000000000000000000000000f4240",
        },
      ],
      balanceChanges: [
        {
          address: recipient,
          tokenAddress: USDT_ADDRESS,
          value: "1000000",
        },
      ],
    });

    const res = await POST(makeRequest(VALID_BODY));
    const body = await res.json();
    const tokenAddress = USDT_ADDRESS.toLowerCase();

    expect(res.status).toBe(200);
    expect(VIEM_MOCKS.http).toHaveBeenCalledWith(
      "https://ethereum-rpc.publicnode.com",
    );
    expect(body._tokenMeta.tokenSymbols[tokenAddress]).toBe("USDT");
    expect(body._tokenMeta.tokenDecimals[tokenAddress]).toBe(6);
    expect(body.balanceChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          address: recipient.toLowerCase(),
          tokenAddress,
          symbol: "USDT",
          name: "USDT",
          decimals: 6,
          amount: "1",
        }),
      ]),
    );
  });
});

describe("POST /api/simulate-tx — state overrides", () => {
  it("passes balanceOverrides to simulateWithTevm", async () => {
    const balanceOverrides = [{ address: "0xabc", balance: "1.5" }];
    await POST(makeRequest({ ...VALID_BODY, balanceOverrides }));
    expect(simulateWithTevm).toHaveBeenCalledWith(
      expect.objectContaining({ balanceOverrides }),
    );
  });

  it("passes storageOverrides to simulateWithTevm", async () => {
    const storageOverrides = [{ address: "0xdef", slot: "0x0", value: "0xff" }];
    await POST(makeRequest({ ...VALID_BODY, storageOverrides }));
    expect(simulateWithTevm).toHaveBeenCalledWith(
      expect.objectContaining({ storageOverrides }),
    );
  });

  it("defaults balanceOverrides to empty array when not provided", async () => {
    await POST(makeRequest(VALID_BODY));
    expect(simulateWithTevm).toHaveBeenCalledWith(
      expect.objectContaining({ balanceOverrides: [] }),
    );
  });

  it("defaults storageOverrides to empty array when not provided", async () => {
    await POST(makeRequest(VALID_BODY));
    expect(simulateWithTevm).toHaveBeenCalledWith(
      expect.objectContaining({ storageOverrides: [] }),
    );
  });

  it("passes cheatcodes to simulateWithTevm", async () => {
    const cheatcodes = {
      deal: { address: "0xabc", amount: "1.5" },
      warp: { timestamp: 1700000000 },
      prank: { address: "0xdef" },
    };
    await POST(makeRequest({ ...VALID_BODY, cheatcodes }));
    expect(simulateWithTevm).toHaveBeenCalledWith(
      expect.objectContaining({ cheatcodes }),
    );
  });

  it("defaults cheatcodes to empty object when not provided", async () => {
    await POST(makeRequest(VALID_BODY));
    expect(simulateWithTevm).toHaveBeenCalledWith(
      expect.objectContaining({ cheatcodes: {} }),
    );
  });

  it("returns 400 when the custom rpcUrl is not an http(s) URL", async () => {
    const res = await POST(
      makeRequest({ ...VALID_BODY, rpcUrl: "file:///etc/passwd" }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/rpcUrl/i);
  });
});

describe("POST /api/simulate-tx — session mode", () => {
  const SESSION_BODY = {
    chainId: 1,
    blockNumber: "latest",
    calls: [
      {
        to: "0x99161BA892ECae335616624c84FAA418F64FF9A6",
        data: "0x5e7db13d000000000000000000000000e556aba6fe6036275ec1f87eda296be72c811bce0000000000000000000000000000000000000000000000000000000000000001",
        from: "0xd719fc03782E9617e81D138a3e9B1875da4D6a03",
      },
      {
        to: "0x99161BA892ECae335616624c84FAA418F64FF9A6",
        data: "0x5e7db13d000000000000000000000000e556aba6fe6036275ec1f87eda296be72c811bce0000000000000000000000000000000000000000000000000000000000000002",
        from: "0xd719fc03782E9617e81D138a3e9B1875da4D6a03",
      },
    ],
  };

  it("returns 400 when calls is not an array", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, calls: "nope" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/calls/i);
  });

  it("returns 400 when calls is an empty array", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, calls: [] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/calls/i);
  });

  it("returns 400 when a call is missing required fields", async () => {
    const res = await POST(
      makeRequest({
        ...SESSION_BODY,
        calls: [{ to: SESSION_BODY.calls[0].to, data: "0x", from: undefined }],
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/from/i);
  });

  it("returns 400 when a call has an invalid address", async () => {
    const res = await POST(
      makeRequest({
        ...SESSION_BODY,
        calls: [{ ...SESSION_BODY.calls[0], to: "invalid" }],
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/to/i);
  });

  it("returns 400 when a call has invalid data hex", async () => {
    const res = await POST(
      makeRequest({
        ...SESSION_BODY,
        calls: [{ ...SESSION_BODY.calls[0], data: "not-hex" }],
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/data/i);
  });

  it("creates a single tevm client and simulates each call on it", async () => {
    const fakeClient = { tevmReady: async () => {} };
    createTevmClient.mockResolvedValue({
      client: fakeClient,
      blockNumber: "latest",
    });
    const res = await POST(makeRequest(SESSION_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.session).toBe(true);
    expect(body.chainId).toBe(1);
    expect(body.results).toHaveLength(2);
    expect(body.results[0].success).toBe(true);
    expect(body.results[1].success).toBe(true);

    expect(createTevmClient).toHaveBeenCalledOnce();
    expect(simulateWithClient).toHaveBeenCalledTimes(2);
    expect(simulateWithClient).toHaveBeenNthCalledWith(
      1,
      fakeClient,
      "latest",
      expect.objectContaining({
        functionName: "unlockAsset",
        persistState: true,
      }),
    );
    expect(simulateWithClient).toHaveBeenNthCalledWith(
      2,
      fakeClient,
      "latest",
      expect.objectContaining({
        callData: SESSION_BODY.calls[1].data,
        persistState: true,
      }),
    );
    expect(simulateWithTevm).not.toHaveBeenCalled();
  });

  it("supports CREATE entries and preserves the created address", async () => {
    simulateWithClient.mockResolvedValue({
      ...SIM_RESULT,
      createdAddress: CREATED_ADDRESS,
    });
    const createCall = {
      data: CREATE_INIT_CODE,
      from: VALID_BODY.from,
    };
    const res = await POST(makeRequest({ chainId: 1, calls: [createCall] }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(simulateWithClient).toHaveBeenCalledWith(
      expect.anything(),
      "latest",
      expect.objectContaining({
        isCreate: true,
        address: null,
        callData: CREATE_INIT_CODE,
        persistState: true,
      }),
    );
    expect(body.results[0].createdAddress).toBe(CREATED_ADDRESS);
  });

  it("passes the fork RPC and customChainId when rpcUrl is provided", async () => {
    const rpcUrl = "https://203.0.113.10";
    await POST(makeRequest({ ...SESSION_BODY, chainId: 999999, rpcUrl }));
    expect(createTevmClient).toHaveBeenCalledWith(
      "chain-999999",
      rpcUrl,
      "latest",
      999999,
      expect.any(Number),
    );
    expect(simulateWithClient).toHaveBeenCalledWith(
      expect.anything(),
      "latest",
      expect.objectContaining({ rpcUrl, customChainId: 999999 }),
    );
  });

  it("applies session-level overrides and cheatcodes to each call", async () => {
    const balanceOverrides = [{ address: "0xabc", balance: "1.5" }];
    const storageOverrides = [{ address: "0xdef", slot: "0x0", value: "0xff" }];
    const cheatcodes = { deal: { address: "0xabc", amount: "1.5" } };
    const res = await POST(
      makeRequest({
        ...SESSION_BODY,
        balanceOverrides,
        storageOverrides,
        cheatcodes,
      }),
    );
    expect(res.status).toBe(200);
    expect(simulateWithClient).toHaveBeenCalledTimes(2);
    for (const call of simulateWithClient.mock.calls) {
      expect(call[2]).toEqual(
        expect.objectContaining({
          balanceOverrides,
          storageOverrides,
          cheatcodes,
        }),
      );
    }
  });

  it("lets per-call overrides take precedence over session-level ones", async () => {
    const topLevel = [{ address: "0xabc", balance: "1.5" }];
    const perCall = [{ address: "0xbbb", balance: "2.5" }];
    await POST(
      makeRequest({
        ...SESSION_BODY,
        balanceOverrides: topLevel,
        calls: [
          SESSION_BODY.calls[0],
          { ...SESSION_BODY.calls[1], balanceOverrides: perCall },
        ],
      }),
    );
    expect(simulateWithClient).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      "latest",
      expect.objectContaining({ balanceOverrides: topLevel }),
    );
    expect(simulateWithClient).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      "latest",
      expect.objectContaining({ balanceOverrides: perCall }),
    );
  });

  it("includes requestBody on each session result", async () => {
    const res = await POST(makeRequest(SESSION_BODY));
    const body = await res.json();
    expect(body.results[0].requestBody).toEqual(
      expect.objectContaining({
        chainId: 1,
        to: SESSION_BODY.calls[0].to,
        functionName: "unlockAsset",
      }),
    );
    expect(body.results[1].requestBody).toEqual(
      expect.objectContaining({
        data: SESSION_BODY.calls[1].data,
        functionName: "unlockAsset",
      }),
    );
  });

  it("saves the whole session under a single id when save: true", async () => {
    const res = await POST(makeRequest({ ...SESSION_BODY, save: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(saveSimulationResult).toHaveBeenCalledTimes(1);
    expect(body.simulationId).toBe(FAKE_SIMULATION_ID);
    expect(body.simulationLink).toContain(FAKE_SIMULATION_ID);
    const saved = saveSimulationResult.mock.calls[0][0];
    expect(saved.session).toBe(true);
    expect(saved.results).toHaveLength(2);
    expect(saved.results[0].requestBody).toBeDefined();
    expect(body.results[0].simulationId).toBeUndefined();
  });

  it("does not call saveSimulationResult in session mode when save is omitted", async () => {
    await POST(makeRequest(SESSION_BODY));
    expect(saveSimulationResult).not.toHaveBeenCalled();
  });

  it("records a per-call error and continues when a call throws", async () => {
    simulateWithClient
      .mockResolvedValueOnce(SIM_RESULT)
      .mockRejectedValueOnce(new Error("tevm internal error"));
    const res = await POST(makeRequest(SESSION_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toHaveLength(2);
    expect(body.results[0].success).toBe(true);
    expect(body.results[1].success).toBe(false);
    expect(body.results[1].error).toMatch(/tevm internal error/i);
  });

  it("returns 500 when createTevmClient fails", async () => {
    createTevmClient.mockRejectedValue(new Error("fork failed"));
    const res = await POST(makeRequest(SESSION_BODY));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/fork failed/i);
  });

  it("fetches the ABI once and reuses it across session calls", async () => {
    await POST(makeRequest(SESSION_BODY));
    expect(fetchAbi).toHaveBeenCalledOnce();
    expect(getAbiFromCache).toHaveBeenCalledOnce();
  });
});

describe("POST /api/simulate-tx — save failure handling", () => {
  it("redacts rpcUrl from the SAVED result while keeping it in the live response", async () => {
    const customRpc = "https://203.0.113.10";
    const res = await POST(
      makeRequest({ ...VALID_BODY, rpcUrl: customRpc, save: true }),
    );
    const body = await res.json();
    // Live response still echoes the caller's own URL
    expect(body.requestBody.rpcUrl).toBe(customRpc);
    // Stored copy shared via link must not disclose it
    const saved = saveSimulationResult.mock.calls[0][0];
    expect(saved.requestBody.rpcUrl).toBe("[redacted]");
  });

  it("scrubs fork RPC URLs embedded in saved error messages", async () => {
    simulateWithTevm.mockRejectedValueOnce(
      new Error("fork request to https://203.0.113.10/v2/key failed"),
    );
    await POST(
      makeRequest({
        ...VALID_BODY,
        rpcUrl: "https://203.0.113.10",
        save: true,
      }),
    );
    const saved = saveSimulationResult.mock.calls[0][0];
    expect(saved.success).toBe(false);
    expect(saved.error).not.toContain("https://203.0.113.10");
    expect(saved.error).toContain("[redacted]");
  });

  it("redacts rpcUrl in every entry of a saved session bundle", async () => {
    const SESSION_SAVE_BODY = {
      ...VALID_BODY,
      chainId: 1,
      blockNumber: "latest",
      calls: [
        { to: VALID_BODY.to, data: VALID_BODY.data, from: VALID_BODY.from },
        { to: VALID_BODY.to, data: VALID_BODY.data, from: VALID_BODY.from },
      ],
      rpcUrl: "https://203.0.113.10",
      save: true,
    };
    await POST(makeRequest(SESSION_SAVE_BODY));
    const savedCalls = saveSimulationResult.mock.calls.filter(
      ([arg]) => arg && arg.session === true,
    );
    expect(savedCalls.length).toBeGreaterThan(0);
    const savedSession = savedCalls[0][0];
    for (const r of savedSession.results) {
      expect(r.requestBody.rpcUrl).toBe("[redacted]");
    }
  });

  it("returns the simulation result without simulationId when the save is rejected (e.g. oversize)", async () => {
    saveSimulationResult.mockRejectedValueOnce(
      new Error("Simulation payload exceeds the maximum allowed size (2MB)"),
    );
    const res = await POST(makeRequest({ ...VALID_BODY, save: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.simulationId).toBeUndefined();
    expect(body.simulationLink).toBeUndefined();
  });
});

describe("POST /api/simulate-tx — pcs stripping and source-line resolution", () => {
  const TRACE_TO = "0x99161ba892ecae335616624c84faa418f64ff9a6";
  const SESSION_BODY = {
    chainId: 1,
    blockNumber: "latest",
    calls: [
      { to: VALID_BODY.to, data: VALID_BODY.data, from: VALID_BODY.from },
      { to: VALID_BODY.to, data: VALID_BODY.data, from: VALID_BODY.from },
    ],
  };
  const SIM_WITH_TRACE = {
    ...SIM_RESULT,
    callTrace: {
      type: "CALL",
      to: TRACE_TO,
      pcs: [10, 20],
      calls: [{ type: "CALL", to: null, pcs: [30], calls: [] }],
    },
  };

  beforeEach(() => {
    resolveTraceSourceLinesForSave.mockImplementation(async (trace) => {
      trace.sourceLines = [1, 2, 3];
      trace.sourceFile = "a.sol";
    });
  });

  // Regression guard: raw pcs arrays once made up ~43% of the API payload
  // (see #155). No `pcs` key may appear anywhere in the response or in the
  // saved copy, at any depth of the trace tree.
  function expectNoPcs(value, path = "$") {
    if (Array.isArray(value)) {
      value.forEach((v, i) => expectNoPcs(v, `${path}[${i}]`));
    } else if (value && typeof value === "object") {
      expect(value, `pcs leaked at ${path}`).not.toHaveProperty("pcs");
      for (const [k, v] of Object.entries(value)) {
        expectNoPcs(v, `${path}.${k}`);
      }
    }
  }

  it("regression: no pcs key anywhere in the response or the saved copy", async () => {
    simulateWithTevm.mockResolvedValueOnce(SIM_WITH_TRACE);
    const res = await POST(makeRequest({ ...VALID_BODY, save: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expectNoPcs(body);
    expectNoPcs(saveSimulationResult.mock.calls[0][0]);
    // Source lines replaced the pcs for shared-result rendering
    expect(body.callTrace.sourceLines).toEqual([1, 2, 3]);
  });

  it("strips pcs from the response when save is omitted", async () => {
    simulateWithTevm.mockResolvedValueOnce(SIM_WITH_TRACE);
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.callTrace.pcs).toBeUndefined();
    expect(body.callTrace.calls[0].pcs).toBeUndefined();
    expect(resolveTraceSourceLinesForSave).not.toHaveBeenCalled();
  });

  it("resolves source lines and strips pcs in both response and saved copy when save: true", async () => {
    simulateWithTevm.mockResolvedValueOnce(SIM_WITH_TRACE);
    const res = await POST(makeRequest({ ...VALID_BODY, save: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(resolveTraceSourceLinesForSave).toHaveBeenCalledOnce();
    expect(body.callTrace.sourceLines).toEqual([1, 2, 3]);
    expect(body.callTrace.pcs).toBeUndefined();
    const saved = saveSimulationResult.mock.calls[0][0];
    expect(saved.callTrace.sourceLines).toEqual([1, 2, 3]);
    expect(saved.callTrace.pcs).toBeUndefined();
    expect(saved.callTrace.calls[0].pcs).toBeUndefined();
  });

  it("strips pcs and skips resolution when the trace is null", async () => {
    simulateWithTevm.mockResolvedValueOnce(SIM_RESULT);
    const res = await POST(makeRequest(VALID_BODY));
    const body = await res.json();
    expect(body.callTrace).toBeNull();
    expect(resolveTraceSourceLinesForSave).not.toHaveBeenCalled();
  });

  it("resolves source lines and strips pcs in every entry of a saved session bundle", async () => {
    simulateWithClient.mockResolvedValue(SIM_WITH_TRACE);
    const res = await POST(makeRequest({ ...SESSION_BODY, save: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(resolveTraceSourceLinesForSave).toHaveBeenCalledTimes(2);
    for (const r of body.results) {
      expect(r.callTrace.pcs).toBeUndefined();
    }
    const saved = saveSimulationResult.mock.calls[0][0];
    expect(saved.session).toBe(true);
    expect(saved.results[0].callTrace.sourceLines).toEqual([1, 2, 3]);
    expect(saved.results[1].callTrace.pcs).toBeUndefined();
  });
});
