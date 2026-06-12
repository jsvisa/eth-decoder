import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useHistory } from "../../../app/contract-caller/hooks/useHistory.js";

// jsdom provides localStorage; clear between tests.
beforeEach(() => {
  localStorage.clear();
  // Reset URL search params
  window.history.replaceState(null, "", "/");
  // Restore mocked window.confirm
  vi.restoreAllMocks();
});

// Helper: build the minimal set of params the hook needs.
function makeParams(overrides = {}) {
  return {
    chain: "ethereum",
    address: "0xabc",
    selectedFunction: "transfer(address,uint256)",
    args: ["0xdead", "100"],
    fromAddress: "",
    contractName: "TestToken",
    getSelectedFunction: () => ({
      name: "transfer",
      inputs: [{ type: "address" }, { type: "uint256" }],
    }),
    setChain: vi.fn(),
    setAddress: vi.fn(),
    setSelectedFunction: vi.fn(),
    setArgs: vi.fn(),
    setFromAddress: vi.fn(),
    setResult: vi.fn(),
    setError: vi.fn(),
    setEthValue: vi.fn(),
    applyPendingArgs: vi.fn(),
    ...overrides,
  };
}

// ── Initial state ──────────────────────────────────────────────────────────
describe("initial state", () => {
  it("returns empty history on first mount", () => {
    const { result } = renderHook(() => useHistory(makeParams()));
    expect(result.current.history).toEqual([]);
  });

  it("showHistory defaults to true", () => {
    const { result } = renderHook(() => useHistory(makeParams()));
    expect(result.current.showHistory).toBe(true);
  });

  it("historySearch defaults to empty string", () => {
    const { result } = renderHook(() => useHistory(makeParams()));
    expect(result.current.historySearch).toBe("");
  });

  it("expandedHistoryIds defaults to empty Set", () => {
    const { result } = renderHook(() => useHistory(makeParams()));
    expect(result.current.expandedHistoryIds).toBeInstanceOf(Set);
    expect(result.current.expandedHistoryIds.size).toBe(0);
  });

  it("loads persisted history from localStorage on mount", () => {
    const stored = [
      {
        id: 1,
        chain: "ethereum",
        address: "0xabc",
        functionName: "transfer",
        functionSig: "transfer(address,uint256)",
        args: ["0xdead", "100"],
        fromAddress: "",
        output: "1",
        contractName: "Token",
        isWrite: false,
        timestamp: "2024-01-01T00:00:00.000Z",
      },
    ];
    localStorage.setItem("contract_caller_history", JSON.stringify(stored));

    const { result } = renderHook(() => useHistory(makeParams()));
    expect(result.current.history).toEqual(stored);
  });

  it("hydrates share-link function args into selection state on mount", () => {
    const applyPendingArgs = vi.fn();
    window.history.replaceState(
      null,
      "",
      "/contract-caller?chain=ethereum&address=0xabc&function=transfer(address,uint256)&args=%5B%220xdead%22%2C%22100%22%5D",
    );

    renderHook(() =>
      useHistory(
        makeParams({
          applyPendingArgs,
        }),
      ),
    );

    expect(applyPendingArgs).toHaveBeenCalledWith({
      functionSig: "transfer(address,uint256)",
      args: ["0xdead", "100"],
      timestamp: expect.any(Number),
    });
  });
});

// ── saveToHistory (happy path) ─────────────────────────────────────────────
describe("saveToHistory", () => {
  it("adds a new history item and persists it", () => {
    const { result } = renderHook(() => useHistory(makeParams()));

    act(() => {
      result.current.saveToHistory({}, "42", false);
    });

    expect(result.current.history).toHaveLength(1);
    const item = result.current.history[0];
    expect(item.chain).toBe("ethereum");
    expect(item.address).toBe("0xabc");
    expect(item.functionSig).toBe("transfer(address,uint256)");
    expect(item.output).toBe("42");
    expect(item.isWrite).toBe(false);

    const persisted = JSON.parse(
      localStorage.getItem("contract_caller_history"),
    );
    expect(persisted).toHaveLength(1);
    expect(persisted[0].output).toBe("42");
  });

  it("deduplicates: updates existing item and moves it to top", () => {
    const { result } = renderHook(() => useHistory(makeParams()));

    act(() => {
      result.current.saveToHistory({}, "first", false);
    });

    // Save again with same key
    act(() => {
      result.current.saveToHistory({}, "second", false);
    });

    expect(result.current.history).toHaveLength(1);
    expect(result.current.history[0].output).toBe("second");
  });

  it("caps history at MAX_HISTORY_ITEMS (50)", () => {
    // Pre-fill localStorage with 50 items
    const existing = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      chain: "ethereum",
      address: `0x${String(i).padStart(40, "0")}`,
      functionName: `fn${i}`,
      functionSig: `fn${i}()`,
      args: [],
      fromAddress: "",
      output: null,
      contractName: null,
      isWrite: false,
      timestamp: new Date().toISOString(),
    }));
    localStorage.setItem("contract_caller_history", JSON.stringify(existing));

    const params = makeParams({
      // Use a unique address so it won't match any existing item
      address: "0xNEWADDRESS",
    });
    const { result } = renderHook(() => useHistory(params));

    act(() => {
      result.current.saveToHistory({}, "new", false);
    });

    expect(result.current.history).toHaveLength(50);
    expect(result.current.history[0].address).toBe("0xNEWADDRESS");
  });
});

// ── loadFromHistory ────────────────────────────────────────────────────────
describe("loadFromHistory", () => {
  it("sets args directly when contract + function match", () => {
    const setArgs = vi.fn();
    const setChain = vi.fn();
    const setFromAddress = vi.fn();
    const setResult = vi.fn();
    const setError = vi.fn();

    const params = makeParams({
      setArgs,
      setChain,
      setFromAddress,
      setResult,
      setError,
    });
    const { result } = renderHook(() => useHistory(params));

    const item = {
      id: 99,
      chain: "ethereum",
      address: "0xabc", // same as params.address
      functionSig: "transfer(address,uint256)", // same as params.selectedFunction
      args: ["0xbeef", "200"],
      fromAddress: "0xcafe",
      output: "result",
    };

    act(() => {
      result.current.loadFromHistory(item);
    });

    expect(setArgs).toHaveBeenCalledWith(["0xbeef", "200"]);
    expect(setResult).toHaveBeenCalledWith("result");
    expect(setError).toHaveBeenCalledWith(null);
    // Should NOT set pendingHistoryRef when same contract+function
    expect(result.current.pendingHistoryRef.current).toBeNull();
  });

  it("sets pendingHistoryRef when switching to a different contract", () => {
    const applyPendingArgs = vi.fn();
    const params = makeParams({ applyPendingArgs });
    const { result } = renderHook(() => useHistory(params));

    const item = {
      id: 77,
      chain: "arbitrum",
      address: "0xDIFFERENT",
      functionSig: "balanceOf(address)",
      args: ["0x1234"],
      fromAddress: "",
      output: "999",
    };

    act(() => {
      result.current.loadFromHistory(item);
    });

    expect(result.current.pendingHistoryRef.current).not.toBeNull();
    expect(result.current.pendingHistoryRef.current.functionSig).toBe(
      "balanceOf(address)",
    );
    expect(result.current.pendingHistoryRef.current.args).toEqual(["0x1234"]);
    expect(applyPendingArgs).toHaveBeenCalledWith({
      functionSig: "balanceOf(address)",
      args: ["0x1234"],
      timestamp: expect.any(Number),
    });
  });
});

// ── clearHistory ───────────────────────────────────────────────────────────
describe("clearHistory", () => {
  it("clears history and removes localStorage entry after confirm", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    localStorage.setItem(
      "contract_caller_history",
      JSON.stringify([{ id: 1 }]),
    );

    const { result } = renderHook(() => useHistory(makeParams()));

    act(() => {
      result.current.clearHistory();
    });

    expect(result.current.history).toEqual([]);
    expect(localStorage.getItem("contract_caller_history")).toBeNull();
  });

  it("does nothing when user cancels confirm", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const stored = [{ id: 1 }];
    localStorage.setItem("contract_caller_history", JSON.stringify(stored));

    const { result } = renderHook(() => useHistory(makeParams()));
    // history loaded from localStorage by mount effect

    act(() => {
      result.current.clearHistory();
    });

    expect(result.current.history).toEqual(stored);
  });
});

// ── toggleHistoryExpanded ──────────────────────────────────────────────────
describe("toggleHistoryExpanded", () => {
  it("adds an id to the expanded set", () => {
    const { result } = renderHook(() => useHistory(makeParams()));

    act(() => {
      result.current.toggleHistoryExpanded(42);
    });

    expect(result.current.expandedHistoryIds.has(42)).toBe(true);
  });

  it("removes an id that is already expanded (toggle off)", () => {
    const { result } = renderHook(() => useHistory(makeParams()));

    act(() => {
      result.current.toggleHistoryExpanded(42);
    });
    act(() => {
      result.current.toggleHistoryExpanded(42);
    });

    expect(result.current.expandedHistoryIds.has(42)).toBe(false);
  });
});

// ── consumePendingArgs ─────────────────────────────────────────────────────
describe("consumePendingArgs", () => {
  it("returns null when nothing is pending", () => {
    const { result } = renderHook(() => useHistory(makeParams()));
    expect(result.current.consumePendingArgs()).toBeNull();
  });

  it("returns and clears the pending ref set by loadFromHistory", () => {
    const params = makeParams();
    const { result } = renderHook(() => useHistory(params));

    const item = {
      id: 5,
      chain: "base",
      address: "0xOTHER",
      functionSig: "foo()",
      args: [],
      fromAddress: "",
      output: null,
    };

    act(() => {
      result.current.loadFromHistory(item);
    });

    let pending;
    act(() => {
      pending = result.current.consumePendingArgs();
    });

    expect(pending).not.toBeNull();
    expect(pending.functionSig).toBe("foo()");
    // Should be cleared now
    expect(result.current.pendingHistoryRef.current).toBeNull();
  });
});

// ── saveSessionBundle ──────────────────────────────────────────────────────
describe("saveSessionBundle", () => {
  it("saves a session bundle to history and localStorage", () => {
    const { result } = renderHook(() => useHistory(makeParams()));

    const sessionTxs = [
      { id: 1, functionName: "mint", success: true },
      { id: 2, functionName: "transfer", success: false },
    ];

    act(() => {
      result.current.saveSessionBundle(sessionTxs, "12345678");
    });

    expect(result.current.history).toHaveLength(1);
    const bundle = result.current.history[0];
    expect(bundle.type).toBe("session");
    expect(bundle.chain).toBe("ethereum");
    expect(bundle.block).toBe("12345678");
    expect(bundle.txs).toEqual(sessionTxs);

    const persisted = JSON.parse(
      localStorage.getItem("contract_caller_history"),
    );
    expect(persisted[0].type).toBe("session");
  });

  it("does nothing when session has no txs", () => {
    const { result } = renderHook(() => useHistory(makeParams()));

    act(() => {
      result.current.saveSessionBundle([], null);
    });

    expect(result.current.history).toEqual([]);
  });
});
