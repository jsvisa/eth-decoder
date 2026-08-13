import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAddChainModal } from "../../../app/contract-caller/hooks/useAddChainModal.js";

// ---------------------------------------------------------------------------
// Mock useSettings so we never import any JSX file. The hook only needs:
//   customChains, saveCustomChains, rpcSettings, saveRpcSettings
// ---------------------------------------------------------------------------
let mockCustomChains = [];
const mockSaveCustomChains = vi.fn((chains) => {
  mockCustomChains = chains;
});
let mockRpcSettings = {};
const mockSaveRpcSettings = vi.fn((settings) => {
  mockRpcSettings = settings;
});

vi.mock("../../../app/contexts/SettingsContext.js", () => ({
  useSettings: () => ({
    customChains: mockCustomChains,
    saveCustomChains: mockSaveCustomChains,
    rpcSettings: mockRpcSettings,
    saveRpcSettings: mockSaveRpcSettings,
  }),
}));

beforeEach(() => {
  localStorage.clear();
  mockCustomChains = [];
  mockRpcSettings = {};
  mockSaveCustomChains.mockClear();
  mockSaveRpcSettings.mockClear();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------
describe("useAddChainModal – initial state", () => {
  it("starts with modal closed and empty state", () => {
    const setChain = vi.fn();
    const { result } = renderHook(() =>
      useAddChainModal({ chain: "ethereum", setChain }),
    );

    expect(result.current.showAddChainModal).toBe(false);
    expect(result.current.chainlistData).toEqual([]);
    expect(result.current.chainlistLoading).toBe(false);
    expect(result.current.chainlistError).toBeNull();
    expect(result.current.chainlistSearch).toBe("");
    expect(result.current.addedChainsCollapsed).toBe(true);
  });

  it("exposes all required return values", () => {
    const setChain = vi.fn();
    const { result } = renderHook(() =>
      useAddChainModal({ chain: "ethereum", setChain }),
    );

    const keys = [
      "showAddChainModal",
      "openAddChainModal",
      "closeAddChainModal",
      "chainlistData",
      "chainlistLoading",
      "chainlistError",
      "chainlistSearch",
      "setChainlistSearch",
      "visibleChains",
      "showTestnets",
      "setShowTestnets",
      "addedChainsCollapsed",
      "setAddedChainsCollapsed",
      "addCustomChain",
      "removeCustomChain",
      "isChainAdded",
      "searchInputRef",
    ];
    for (const key of keys) {
      expect(result.current).toHaveProperty(key);
    }
  });
});

// ---------------------------------------------------------------------------
// openAddChainModal / closeAddChainModal
// ---------------------------------------------------------------------------
describe("useAddChainModal – openAddChainModal / closeAddChainModal", () => {
  it("openAddChainModal sets showAddChainModal to true and fetches data", async () => {
    const chainlistPayload = [
      {
        chainId: 999,
        name: "Test Chain",
        isTestnet: false,
        rpc: ["https://rpc.example.com"],
        nativeCurrency: { symbol: "TST" },
        tvl: 1000,
      },
      {
        chainId: 998,
        name: "Test Net",
        isTestnet: true,
        rpc: [],
        tvl: 0,
      },
    ];

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => chainlistPayload,
      }),
    );

    const setChain = vi.fn();
    const { result } = renderHook(() =>
      useAddChainModal({ chain: "ethereum", setChain }),
    );

    await act(async () => {
      result.current.openAddChainModal();
    });

    expect(result.current.showAddChainModal).toBe(true);
    // All networks are kept, but by default only mainnets are visible
    expect(result.current.chainlistData).toHaveLength(2);
    expect(result.current.visibleChains).toHaveLength(1);
    expect(result.current.visibleChains[0].chainId).toBe(999);
    expect(result.current.chainlistLoading).toBe(false);
    expect(result.current.chainlistError).toBeNull();
  });

  it("closeAddChainModal hides the modal and clears search", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => [] }),
    );

    const setChain = vi.fn();
    const { result } = renderHook(() =>
      useAddChainModal({ chain: "ethereum", setChain }),
    );

    await act(async () => {
      result.current.openAddChainModal();
    });

    act(() => {
      result.current.setChainlistSearch("foo");
      result.current.setShowTestnets(true);
    });
    expect(result.current.chainlistSearch).toBe("foo");
    expect(result.current.showTestnets).toBe(true);

    act(() => {
      result.current.closeAddChainModal();
    });

    expect(result.current.showAddChainModal).toBe(false);
    expect(result.current.chainlistSearch).toBe("");
    expect(result.current.showTestnets).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// visibleChains (testnet toggle + search filtering)
// ---------------------------------------------------------------------------
describe("useAddChainModal – visibleChains", () => {
  const PAYLOAD = [
    {
      chainId: 999,
      name: "Alpha Mainnet",
      isTestnet: false,
      rpc: [],
      tvl: 1000,
    },
    {
      chainId: 998,
      name: "Alpha Testnet",
      isTestnet: true,
      rpc: [],
      tvl: 0,
    },
    {
      chainId: 997,
      name: "Beta Testnet",
      isTestnet: true,
      rpc: [],
      tvl: 0,
    },
  ];

  async function load(result) {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => PAYLOAD }),
    );
    await act(async () => {
      result.current.openAddChainModal();
    });
  }

  it("shows only mainnets by default", () => {
    const setChain = vi.fn();
    const { result } = renderHook(() =>
      useAddChainModal({ chain: "ethereum", setChain }),
    );

    return load(result).then(() => {
      expect(result.current.visibleChains.map((c) => c.chainId)).toEqual([999]);
    });
  });

  it("shows only testnets when showTestnets is toggled on", () => {
    const setChain = vi.fn();
    const { result } = renderHook(() =>
      useAddChainModal({ chain: "ethereum", setChain }),
    );

    return load(result).then(() => {
      act(() => {
        result.current.setShowTestnets(true);
      });
      expect(result.current.visibleChains.map((c) => c.chainId)).toEqual([
        998, 997,
      ]);
    });
  });

  it("filters by search within the selected network type", () => {
    const setChain = vi.fn();
    const { result } = renderHook(() =>
      useAddChainModal({ chain: "ethereum", setChain }),
    );

    return load(result).then(() => {
      act(() => {
        result.current.setShowTestnets(true);
        result.current.setChainlistSearch("beta");
      });
      expect(result.current.visibleChains.map((c) => c.chainId)).toEqual([997]);
    });
  });

  it("filters by chain ID within the selected network type", () => {
    const setChain = vi.fn();
    const { result } = renderHook(() =>
      useAddChainModal({ chain: "ethereum", setChain }),
    );

    return load(result).then(() => {
      act(() => {
        result.current.setChainlistSearch("999");
      });
      expect(result.current.visibleChains.map((c) => c.chainId)).toEqual([999]);
    });
  });
});

// ---------------------------------------------------------------------------
// addCustomChain / removeCustomChain / isChainAdded
// ---------------------------------------------------------------------------
describe("useAddChainModal – addCustomChain / removeCustomChain / isChainAdded", () => {
  it("addCustomChain adds a chain, calls saveCustomChains, and persists to localStorage", () => {
    const setChain = vi.fn();
    const { result } = renderHook(() =>
      useAddChainModal({ chain: "ethereum", setChain }),
    );

    const chainData = {
      chainId: 42424242,
      name: "My Custom Chain",
      isTestnet: false,
      rpc: [{ url: "https://rpc.mychain.io", tracking: "none" }],
      nativeCurrency: { symbol: "MCC" },
      explorers: [],
      icon: null,
    };

    let added;
    act(() => {
      added = result.current.addCustomChain(chainData);
    });

    expect(added).toBe(true);
    expect(mockSaveCustomChains).toHaveBeenCalledOnce();

    const stored = JSON.parse(localStorage.getItem("custom_chains"));
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe("chain-42424242");
    expect(stored[0].rpcUrl).toBe("https://rpc.mychain.io");
  });

  it("addCustomChain returns false for a built-in chain (ethereum, chainId 1)", () => {
    const setChain = vi.fn();
    const { result } = renderHook(() =>
      useAddChainModal({ chain: "ethereum", setChain }),
    );

    let added;
    act(() => {
      added = result.current.addCustomChain({
        chainId: 1,
        name: "Ethereum",
        rpc: [],
      });
    });

    expect(added).toBe(false);
    expect(mockSaveCustomChains).not.toHaveBeenCalled();
  });

  it("isChainAdded returns true for a built-in chain ID", () => {
    const setChain = vi.fn();
    const { result } = renderHook(() =>
      useAddChainModal({ chain: "ethereum", setChain }),
    );

    // Ethereum (chainId 1) is built-in
    expect(result.current.isChainAdded({ chainId: 1 })).toBe(true);
    // Unknown chain should not be added
    expect(result.current.isChainAdded({ chainId: 12345678 })).toBe(false);
  });

  it("removeCustomChain removes a chain and switches to ethereum if it was active", () => {
    // Seed mockCustomChains with a chain
    mockCustomChains = [
      {
        id: "chain-99999",
        name: "Will Be Removed",
        chainId: 99999,
        rpcUrl: "https://rpc.gone.io",
        explorers: [],
      },
    ];

    const setChain = vi.fn();
    const { result } = renderHook(() =>
      useAddChainModal({ chain: "chain-99999", setChain }),
    );

    act(() => {
      result.current.removeCustomChain("chain-99999");
    });

    expect(mockSaveCustomChains).toHaveBeenCalledWith([]);
    expect(setChain).toHaveBeenCalledWith("ethereum");

    const stored = JSON.parse(localStorage.getItem("custom_chains") || "[]");
    expect(stored).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Fetch error handling
// ---------------------------------------------------------------------------
describe("useAddChainModal – fetch error handling", () => {
  it("sets chainlistError when the response is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );

    const setChain = vi.fn();
    const { result } = renderHook(() =>
      useAddChainModal({ chain: "ethereum", setChain }),
    );

    await act(async () => {
      result.current.openAddChainModal();
    });

    expect(result.current.chainlistError).toBe(
      "Failed to load chain data. Please try again.",
    );
    expect(result.current.chainlistLoading).toBe(false);
    expect(result.current.chainlistData).toEqual([]);
  });

  it("does not re-fetch when chainlistData is already populated", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { chainId: 1234, name: "X", isTestnet: false, rpc: [] },
      ],
    });
    vi.stubGlobal("fetch", fetchMock);

    const setChain = vi.fn();
    const { result } = renderHook(() =>
      useAddChainModal({ chain: "ethereum", setChain }),
    );

    await act(async () => {
      result.current.openAddChainModal();
    });

    // Open again — should not fetch again
    await act(async () => {
      result.current.openAddChainModal();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
