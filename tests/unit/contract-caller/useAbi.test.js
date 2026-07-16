/**
 * Tests for useAbi hook.
 *
 * Strategy: use React's act() + renderHook equivalent via a small wrapper
 * component rendered with ReactDOM. Since @testing-library/react is not
 * installed we drive the hook directly with react-dom/client in jsdom.
 *
 * Patterns follow tests/unit/abiCache.test.js (jsdom environment, no RTL).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { useAbi } from "../../../app/contract-caller/hooks/useAbi.js";

// ---------------------------------------------------------------------------
// Minimal renderHook helper (no @testing-library/react needed)
// ---------------------------------------------------------------------------
function renderHook(hookFn, options = {}) {
  let result = { current: null };
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root;

  function HookWrapper({ hookArgs }) {
    result.current = hookFn(hookArgs);
    return null;
  }

  act(() => {
    root = createRoot(container);
    root.render(
      React.createElement(HookWrapper, { hookArgs: options.initialProps }),
    );
  });

  const rerender = (newProps) => {
    act(() => {
      root.render(React.createElement(HookWrapper, { hookArgs: newProps }));
    });
  };

  const unmount = () => {
    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  };

  return { result, rerender, unmount };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const VALID_ADDRESS = "0x1234567890123456789012345678901234567890";
const SIMPLE_ABI = [
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "transfer",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
  },
];

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------
beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 1. Initial state
// ---------------------------------------------------------------------------
describe("useAbi — initial state", () => {
  it("returns the expected initial values", () => {
    const { result, unmount } = renderHook((args) => useAbi(args), {
      initialProps: { chain: "ethereum", address: "" },
    });

    expect(result.current.abi).toBe("");
    expect(result.current.parsedAbi).toBeNull();
    expect(result.current.functions).toEqual([]);
    expect(result.current.fetchingAbi).toBe(false);
    expect(result.current.abiSource).toBeNull();
    expect(result.current.contractName).toBeNull();
    expect(result.current.abiSaved).toBe(false);
    expect(result.current.cachedAddresses).toEqual([]);
    expect(result.current.abiCollapsed).toBe(true);
    expect(result.current.abiViewMode).toBe("list");
    expect(result.current.abiFilter).toBe("");
    expect(result.current.abiCopiedItem).toBeNull();

    unmount();
  });

  it("exposes all required setters and callbacks", () => {
    const { result, unmount } = renderHook((args) => useAbi(args), {
      initialProps: { chain: "ethereum", address: "" },
    });

    expect(typeof result.current.setAbi).toBe("function");
    expect(typeof result.current.setAbiCollapsed).toBe("function");
    expect(typeof result.current.setAbiViewMode).toBe("function");
    expect(typeof result.current.setAbiFilter).toBe("function");
    expect(typeof result.current.setAbiCopiedItem).toBe("function");
    expect(typeof result.current.fetchAbi).toBe("function");
    expect(typeof result.current.saveAbiToCache).toBe("function");

    unmount();
  });
});

// ---------------------------------------------------------------------------
// 2. Happy path: manual setAbi triggers parsedAbi + functions
// ---------------------------------------------------------------------------
describe("useAbi — setAbi parses ABI and populates functions", () => {
  it("parses valid ABI JSON and extracts functions sorted view-first", () => {
    const { result, unmount } = renderHook((args) => useAbi(args), {
      initialProps: { chain: "ethereum", address: VALID_ADDRESS },
    });

    act(() => {
      result.current.setAbi(JSON.stringify(SIMPLE_ABI));
    });

    expect(result.current.parsedAbi).toEqual(SIMPLE_ABI);
    expect(result.current.functions).toHaveLength(2);
    // view function should come first
    expect(result.current.functions[0].name).toBe("balanceOf");
    expect(result.current.functions[1].name).toBe("transfer");

    unmount();
  });

  it("calls onAbiParsed callback with parsed abi and functions", () => {
    const onAbiParsed = vi.fn();
    const { result, unmount } = renderHook((args) => useAbi(args), {
      initialProps: {
        chain: "ethereum",
        address: VALID_ADDRESS,
        onAbiParsed,
      },
    });

    act(() => {
      result.current.setAbi(JSON.stringify(SIMPLE_ABI));
    });

    expect(onAbiParsed).toHaveBeenCalled();
    // Find the call that has the full ABI (not a null/empty one from earlier effects)
    const fullAbiCall = onAbiParsed.mock.calls.find(
      ([p]) => p !== null && Array.isArray(p) && p.length > 0,
    );
    expect(fullAbiCall).toBeDefined();
    const [parsedArg, funcsArg] = fullAbiCall;
    expect(parsedArg).toEqual(SIMPLE_ABI);
    expect(funcsArg).toHaveLength(2);

    unmount();
  });

  it("auto-loads cached ABI when a valid address is provided", () => {
    // Pre-populate localStorage with a cached ABI
    const cacheKey = `abi-ethereum-${VALID_ADDRESS.toLowerCase()}`;
    localStorage.setItem(
      cacheKey,
      JSON.stringify({
        abi: SIMPLE_ABI,
        isProxy: false,
        implAddress: null,
        contractName: "MyToken",
        implContractName: null,
        timestamp: Date.now(),
      }),
    );

    const { result, unmount } = renderHook((args) => useAbi(args), {
      initialProps: { chain: "ethereum", address: VALID_ADDRESS },
    });

    // After mount the effect should have loaded the cached ABI
    expect(result.current.abiSource).toBe("cached");
    expect(result.current.contractName).toBe("MyToken");
    // abi should be non-empty (formatted)
    expect(result.current.abi.length).toBeGreaterThan(0);

    unmount();
  });

  it("fetchAbi fetches from API and populates state", async () => {
    const mockResponseData = {
      abi: SIMPLE_ABI,
      isProxy: false,
      implAddress: null,
      contractName: "FetchedToken",
      implContractName: null,
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponseData,
    });

    let hookResult;
    const { result, unmount } = renderHook((args) => useAbi(args), {
      initialProps: {
        chain: "ethereum",
        address: VALID_ADDRESS,
        apiKeys: { etherscan: "test-key" },
        rpcSettings: {},
        getChainId: () => 1,
      },
    });
    hookResult = result;

    await act(async () => {
      await hookResult.current.fetchAbi(true); // force refresh
    });

    expect(hookResult.current.contractName).toBe("FetchedToken");
    expect(hookResult.current.abiSource).toBe("fetched");
    expect(hookResult.current.fetchingAbi).toBe(false);
    expect(hookResult.current.abiCollapsed).toBe(false); // expanded on first fetch

    unmount();
  });
});

// ---------------------------------------------------------------------------
// 3. Error / edge cases
// ---------------------------------------------------------------------------
describe("useAbi — error and edge cases", () => {
  it("sets parsedAbi to null and calls onAbiError for invalid JSON", () => {
    const onAbiError = vi.fn();
    const { result, unmount } = renderHook((args) => useAbi(args), {
      initialProps: {
        chain: "ethereum",
        address: VALID_ADDRESS,
        onAbiError,
      },
    });

    act(() => {
      result.current.setAbi("not valid json {{");
    });

    expect(result.current.parsedAbi).toBeNull();
    expect(result.current.functions).toEqual([]);
    expect(onAbiError).toHaveBeenCalledWith("Invalid ABI JSON format");

    unmount();
  });

  it("clears parsedAbi and functions when abi is set to empty string", () => {
    const { result, unmount } = renderHook((args) => useAbi(args), {
      initialProps: { chain: "ethereum", address: VALID_ADDRESS },
    });

    act(() => {
      result.current.setAbi(JSON.stringify(SIMPLE_ABI));
    });
    expect(result.current.parsedAbi).not.toBeNull();

    act(() => {
      result.current.setAbi("");
    });

    expect(result.current.parsedAbi).toBeNull();
    expect(result.current.functions).toEqual([]);

    unmount();
  });

  it("fetchAbi calls onSetError when address is empty", async () => {
    const onSetError = vi.fn();
    const { result, unmount } = renderHook((args) => useAbi(args), {
      initialProps: { chain: "ethereum", address: "", onSetError },
    });

    await act(async () => {
      await result.current.fetchAbi();
    });

    expect(onSetError).toHaveBeenCalledWith("Please enter a contract address");

    unmount();
  });

  it("fetchAbi calls onSetError on API error", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "API error" }),
    });

    const onSetError = vi.fn();
    const { result, unmount } = renderHook((args) => useAbi(args), {
      initialProps: {
        chain: "ethereum",
        address: VALID_ADDRESS,
        onSetError,
      },
    });

    await act(async () => {
      await result.current.fetchAbi(true);
    });

    expect(onSetError).toHaveBeenCalledWith("API error");
    expect(result.current.fetchingAbi).toBe(false);

    unmount();
  });

  it("saveAbiToCache saves to localStorage and sets abiSaved feedback", () => {
    vi.useFakeTimers();

    const { result, unmount } = renderHook((args) => useAbi(args), {
      initialProps: { chain: "ethereum", address: VALID_ADDRESS },
    });

    act(() => {
      result.current.setAbi(JSON.stringify(SIMPLE_ABI));
    });

    act(() => {
      result.current.saveAbiToCache();
    });

    expect(result.current.abiSaved).toBe(true);

    // Check localStorage was written
    const key = `abi-ethereum-${VALID_ADDRESS.toLowerCase()}`;
    const stored = JSON.parse(localStorage.getItem(key));
    expect(stored).not.toBeNull();
    expect(stored.abi).toEqual(SIMPLE_ABI);

    // After timeout abiSaved should reset to false
    act(() => {
      vi.advanceTimersByTime(2100);
    });
    expect(result.current.abiSaved).toBe(false);

    vi.useRealTimers();
    unmount();
  });
});
