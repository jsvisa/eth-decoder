import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCallExecution } from "../../../app/contract-caller/hooks/useCallExecution.js";

// ── mock heavy dependencies ────────────────────────────────────────────────

vi.mock("../../../app/utils/tevmSimulator.js", () => ({
  simulateWithTevm: vi.fn(),
  simulateWithClient: vi.fn(),
  redecodeLogs: vi.fn((logs) => logs),
  redecodeCallTrace: vi.fn((trace) => trace),
  decodeLogsViaServer: vi.fn(async () => {}),
  decodeCallTraceLogsViaServer: vi.fn(async () => {}),
}));

vi.mock("../../../app/utils/abiCache.js", () => ({
  buildAbiCacheFromStorage: vi.fn(() => new Map()),
  fetchAbisForAddresses: vi.fn(async () => new Map()),
}));

// ── helpers ────────────────────────────────────────────────────────────────

const TRANSFER_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
];

const BALANCE_OF_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
];

const baseParams = {
  chain: "ethereum",
  address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  parsedAbi: BALANCE_OF_ABI,
  selectedFunction: "balanceOf(address)",
  args: ["0x1234567890123456789012345678901234567890"],
  fromAddress: "",
  ethValue: "",
  ethValueUnit: "ETH",
  forkBlockNumber: "",
  readBlockNumber: "",
  tenderlySettings: {},
  apiKeys: {},
  rpcSettings: {},
  useLocalSimulation: false,
  rpcBatchSize: 100,
  isTenderlyConfigured: vi.fn(() => false),
  sessionActive: false,
  sessionStarting: false,
  sessionClientRef: { current: null },
  sessionBlock: null,
  setSessionHistory: vi.fn(),
  contractName: "USDC",
  cheatcodes: {
    deal: { enabled: false, address: "", amount: "" },
    prank: { enabled: false, address: "" },
    warp: { enabled: false, timestamp: "" },
  },
  balanceOverrides: [],
  storageOverrides: [],
  timestampOverride: "",
  setFieldErrors: vi.fn(),
  setShowSettings: vi.fn(),
  getChainId: vi.fn(() => 1),
  setCachedAddresses: vi.fn(),
  getCachedAddresses: vi.fn(() => []),
  saveToHistory: vi.fn(),
  validateAddressesInArg: vi.fn(),
};

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  // Reset fetch mock
  vi.stubGlobal("fetch", vi.fn());
  // Stub clipboard API
  vi.stubGlobal("navigator", {
    clipboard: {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
  });
});

// ── tests ──────────────────────────────────────────────────────────────────

describe("useCallExecution – initial state", () => {
  it("returns correct initial values", () => {
    const { result } = renderHook(() => useCallExecution(baseParams));

    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.simProgress).toBeNull();
    expect(result.current.isYaml).toBe(false);
    expect(result.current.copied).toBe(false);
    expect(result.current.showFullResponse).toBe(false);
    expect(result.current.resultCollapsed).toBe(false);
    expect(result.current.simLogsExpanded).toBe(true);
    expect(result.current.bdExpandedAddrs).toBeInstanceOf(Set);
    expect(result.current.bdExpandedAddrs.size).toBe(0);
    expect(result.current.bdExpandedTokens).toBeInstanceOf(Set);
    expect(result.current.hideTooltip).toBe(false);
    expect(result.current.urlCopied).toBe(false);
  });

  it("exposes all required handlers", () => {
    const { result } = renderHook(() => useCallExecution(baseParams));
    expect(typeof result.current.handleCall).toBe("function");
    expect(typeof result.current.handleCancel).toBe("function");
    expect(typeof result.current.handleCopy).toBe("function");
    expect(typeof result.current.handleShareUrl).toBe("function");
  });
});

describe("useCallExecution – handleCall read (happy path)", () => {
  it("calls /api/call-contract, sets result, and calls saveToHistory", async () => {
    const mockData = { decoded: [{ name: "balance", value: "1000" }] };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    });

    const params = {
      ...baseParams,
      parsedAbi: BALANCE_OF_ABI,
      selectedFunction: "balanceOf(address)",
      args: ["0x1234567890123456789012345678901234567890"],
    };

    const { result } = renderHook(() => useCallExecution(params));

    await act(async () => {
      await result.current.handleCall();
    });

    // result is set
    expect(result.current.result).toEqual(mockData);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);

    // fetch was called with correct endpoint
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/call-contract",
      expect.objectContaining({ method: "POST" }),
    );

    // saveToHistory was called
    expect(params.saveToHistory).toHaveBeenCalledOnce();
  });
});

describe("useCallExecution – handleCall validation", () => {
  it("sets error when address is missing", async () => {
    const params = { ...baseParams, address: "" };
    const { result } = renderHook(() => useCallExecution(params));

    await act(async () => {
      await result.current.handleCall();
    });

    expect(result.current.error).toBe("Please fill in all required fields");
    expect(result.current.loading).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("sets error when parsedAbi is null", async () => {
    const params = { ...baseParams, parsedAbi: null };
    const { result } = renderHook(() => useCallExecution(params));

    await act(async () => {
      await result.current.handleCall();
    });

    expect(result.current.error).toBe("Please fill in all required fields");
  });
});

describe("useCallExecution – handleCall API error", () => {
  it("sets error on non-ok API response", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "contract reverted" }),
    });

    const { result } = renderHook(() => useCallExecution(baseParams));

    await act(async () => {
      await result.current.handleCall();
    });

    expect(result.current.error).toBe("contract reverted");
    expect(result.current.result).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});

describe("useCallExecution – handleCopy", () => {
  it("copies JSON when isYaml is false", async () => {
    const { result } = renderHook(() => useCallExecution(baseParams));

    // set a result first
    await act(async () => {
      result.current.setResult({ foo: "bar" });
    });

    await act(async () => {
      await result.current.handleCopy();
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      JSON.stringify({ foo: "bar" }, null, 2),
    );
    expect(result.current.copied).toBe(true);
  });
});

describe("useCallExecution – toggle state setters", () => {
  it("setIsYaml toggles isYaml", async () => {
    const { result } = renderHook(() => useCallExecution(baseParams));
    expect(result.current.isYaml).toBe(false);

    await act(async () => {
      result.current.setIsYaml(true);
    });

    expect(result.current.isYaml).toBe(true);
  });

  it("setResultCollapsed toggles resultCollapsed", async () => {
    const { result } = renderHook(() => useCallExecution(baseParams));

    await act(async () => {
      result.current.setResultCollapsed(true);
    });

    expect(result.current.resultCollapsed).toBe(true);
  });
});
