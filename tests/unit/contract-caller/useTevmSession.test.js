import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTevmSession } from "../../../app/contract-caller/hooks/useTevmSession.js";

// Mock createTevmClient so tests don't need a real RPC
vi.mock("../../../app/utils/tevmSimulator.js", () => ({
  createTevmClient: vi.fn(),
}));

import { createTevmClient } from "../../../app/utils/tevmSimulator.js";

// jsdom provides localStorage. Clear between tests.
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const DEFAULT_PARAMS = {
  chain: "ethereum",
  rpcUrl: undefined,
  forkBlockNumber: "",
  rpcBatchSize: 1,
  chainId: 1,
  saveBundle: vi.fn(),
  setError: vi.fn(),
};

describe("useTevmSession — initial state", () => {
  it("returns expected default values on mount", () => {
    const { result } = renderHook(() => useTevmSession(DEFAULT_PARAMS));

    expect(result.current.sessionActive).toBe(false);
    expect(result.current.sessionBlock).toBeNull();
    expect(result.current.sessionHistory).toEqual([]);
    expect(result.current.sessionStarting).toBe(false);
    expect(result.current.tevmClientRef).toBeDefined();
    expect(result.current.tevmClientRef.current).toBeNull();
    expect(typeof result.current.handleStartSession).toBe("function");
    expect(typeof result.current.handleResetSession).toBe("function");
    expect(typeof result.current.appendToSessionHistory).toBe("function");
  });
});

describe("useTevmSession — handleStartSession (happy path)", () => {
  it("sets sessionActive and sessionBlock after a successful client creation", async () => {
    const fakeClient = { id: "fake-tevm-client" };
    createTevmClient.mockResolvedValueOnce({
      client: fakeClient,
      blockNumber: 12345678n,
    });

    const params = {
      ...DEFAULT_PARAMS,
      setError: vi.fn(),
      saveBundle: vi.fn(),
    };
    const { result } = renderHook(() => useTevmSession(params));

    await act(async () => {
      await result.current.handleStartSession();
    });

    expect(result.current.sessionActive).toBe(true);
    expect(result.current.sessionBlock).toBe("12345678");
    expect(result.current.sessionHistory).toEqual([]);
    expect(result.current.sessionStarting).toBe(false);
    expect(result.current.tevmClientRef.current).toBe(fakeClient);
    expect(params.setError).toHaveBeenCalledWith(null);
  });

  it("sets sessionBlock to 'latest' when createTevmClient returns 'latest'", async () => {
    createTevmClient.mockResolvedValueOnce({
      client: {},
      blockNumber: "latest",
    });

    const params = {
      ...DEFAULT_PARAMS,
      setError: vi.fn(),
      saveBundle: vi.fn(),
    };
    const { result } = renderHook(() => useTevmSession(params));

    await act(async () => {
      await result.current.handleStartSession();
    });

    expect(result.current.sessionBlock).toBe("latest");
    expect(result.current.sessionActive).toBe(true);
  });
});

describe("useTevmSession — handleStartSession error path", () => {
  it("calls setError and leaves session inactive when createTevmClient throws", async () => {
    createTevmClient.mockRejectedValueOnce(new Error("No RPC URL"));

    const setError = vi.fn();
    const { result } = renderHook(() =>
      useTevmSession({ ...DEFAULT_PARAMS, setError }),
    );

    await act(async () => {
      await result.current.handleStartSession();
    });

    expect(result.current.sessionActive).toBe(false);
    expect(result.current.sessionStarting).toBe(false);
    expect(setError).toHaveBeenCalledWith(
      "Failed to start session: No RPC URL",
    );
  });
});

describe("useTevmSession — handleResetSession", () => {
  it("calls saveBundle with session history and block, then clears session state", async () => {
    const fakeClient = { id: "fake-tevm-client" };
    createTevmClient.mockResolvedValueOnce({
      client: fakeClient,
      blockNumber: 999n,
    });

    const saveBundle = vi.fn();
    const setError = vi.fn();
    const { result } = renderHook(() =>
      useTevmSession({ ...DEFAULT_PARAMS, saveBundle, setError }),
    );

    // Start a session
    await act(async () => {
      await result.current.handleStartSession();
    });

    // Append an entry
    act(() => {
      result.current.appendToSessionHistory({
        id: 1,
        functionName: "transfer",
        success: true,
      });
    });

    expect(result.current.sessionHistory).toHaveLength(1);

    // Reset
    act(() => {
      result.current.handleResetSession();
    });

    expect(saveBundle).toHaveBeenCalledWith(
      [{ id: 1, functionName: "transfer", success: true }],
      "999",
    );
    expect(result.current.sessionActive).toBe(false);
    expect(result.current.sessionBlock).toBeNull();
    expect(result.current.sessionHistory).toEqual([]);
    expect(result.current.tevmClientRef.current).toBeNull();
  });
});

describe("useTevmSession — appendToSessionHistory", () => {
  it("appends entries to sessionHistory", () => {
    const { result } = renderHook(() => useTevmSession(DEFAULT_PARAMS));

    act(() => {
      result.current.appendToSessionHistory({ id: 1, functionName: "foo" });
      result.current.appendToSessionHistory({ id: 2, functionName: "bar" });
    });

    expect(result.current.sessionHistory).toEqual([
      { id: 1, functionName: "foo" },
      { id: 2, functionName: "bar" },
    ]);
  });
});

describe("useTevmSession — chain/forkBlockNumber change effect", () => {
  it("resets session state when chain changes", async () => {
    const fakeClient = { id: "fake-tevm-client" };
    createTevmClient.mockResolvedValueOnce({
      client: fakeClient,
      blockNumber: 100n,
    });

    const setError = vi.fn();
    let chain = "ethereum";
    const { result, rerender } = renderHook(
      ({ chain }) => useTevmSession({ ...DEFAULT_PARAMS, chain, setError }),
      { initialProps: { chain: "ethereum" } },
    );

    // Start session
    await act(async () => {
      await result.current.handleStartSession();
    });

    expect(result.current.sessionActive).toBe(true);

    // Switch chain — effect should reset session
    act(() => {
      rerender({ chain: "base" });
    });

    expect(result.current.sessionActive).toBe(false);
    expect(result.current.sessionBlock).toBeNull();
    expect(result.current.sessionHistory).toEqual([]);
    expect(result.current.tevmClientRef.current).toBeNull();
  });
});
