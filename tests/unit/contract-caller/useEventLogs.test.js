import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useEventLogs } from "../../../app/contract-caller/hooks/useEventLogs.js";

// A minimal ABI with one event for testing
const MOCK_ABI = [
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
];

const VALID_ADDRESS = "0x1234567890123456789012345678901234567890";

const defaultParams = {
  chain: "ethereum",
  address: VALID_ADDRESS,
  parsedAbi: MOCK_ABI,
  apiKeys: { etherscan: "test-api-key" },
  getChainId: (chain) => (chain === "ethereum" ? 1 : null),
  onMissingApiKey: vi.fn(),
};

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------
describe("initial state", () => {
  it("returns correct default values", () => {
    const { result } = renderHook(() => useEventLogs(defaultParams));
    const h = result.current;

    expect(h.activeTab).toBe("functions");
    expect(h.selectedEvents).toEqual([]);
    expect(h.eventFilter).toBe("");
    expect(h.eventLogs).toEqual([]);
    expect(h.fetchingLogs).toBe(false);
    expect(h.logsError).toBeNull();
    expect(h.logsPage).toBe(1);
    expect(h.logsOffset).toBe(1000);
    expect(h.logsFilter).toBe("");
    expect(h.logsFromBlock).toBe("");
    expect(h.logsToBlock).toBe("latest");
    expect(h.latestBlockCache).toBeNull();
    expect(h.logsFetched).toBe(false);
    expect(h.eventListCollapsed).toBe(false);
  });

  it("exposes all required return keys", () => {
    const { result } = renderHook(() => useEventLogs(defaultParams));
    const requiredKeys = [
      "activeTab",
      "setActiveTab",
      "selectedEvents",
      "toggleEventSelection",
      "selectAllEvents",
      "clearEventSelection",
      "eventFilter",
      "setEventFilter",
      "eventListCollapsed",
      "setEventListCollapsed",
      "logsFromBlock",
      "setLogsFromBlock",
      "logsToBlock",
      "setLogsToBlock",
      "logsPage",
      "setLogsPage",
      "logsOffset",
      "setLogsOffset",
      "fetchLogs",
      "fetchingLogs",
      "logsError",
      "logsFetched",
      "eventLogs",
      "logsFilter",
      "setLogsFilter",
      "downloadLogsAsCsv",
      "latestBlockCache",
    ];
    for (const key of requiredKeys) {
      expect(result.current, `missing key: ${key}`).toHaveProperty(key);
    }
  });
});

// ---------------------------------------------------------------------------
// Event selection helpers
// ---------------------------------------------------------------------------
describe("event selection", () => {
  it("toggleEventSelection adds and removes events", () => {
    const { result } = renderHook(() => useEventLogs(defaultParams));

    act(() => {
      result.current.toggleEventSelection("Transfer");
    });
    expect(result.current.selectedEvents).toEqual(["Transfer"]);

    act(() => {
      result.current.toggleEventSelection("Transfer");
    });
    expect(result.current.selectedEvents).toEqual([]);
  });

  it("selectAllEvents selects all events from parsedAbi", () => {
    const { result } = renderHook(() => useEventLogs(defaultParams));

    act(() => {
      result.current.selectAllEvents();
    });
    expect(result.current.selectedEvents).toEqual(["Transfer"]);
  });

  it("clearEventSelection empties selectedEvents", () => {
    const { result } = renderHook(() => useEventLogs(defaultParams));

    act(() => {
      result.current.toggleEventSelection("Transfer");
    });
    act(() => {
      result.current.clearEventSelection();
    });
    expect(result.current.selectedEvents).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// fetchLogs — happy path
// ---------------------------------------------------------------------------
describe("fetchLogs happy path", () => {
  it("fetches and decodes logs, sets logsFetched=true", async () => {
    // Raw log from Etherscan-style API (Transfer event)
    const rawLog = {
      blockNumber: "0x10", // block 16
      timeStamp: "0x60000000",
      transactionHash: "0xabc123",
      topics: [
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", // Transfer topic0
        "0x000000000000000000000000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "0x000000000000000000000000bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      ],
      data: "0x0000000000000000000000000000000000000000000000000000000000000064", // 100
    };

    // Mock /api/get-logs
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({ result: [rawLog] }),
      }),
    );

    const { result } = renderHook(() => useEventLogs(defaultParams));

    // Select the Transfer event
    act(() => {
      result.current.toggleEventSelection("Transfer");
    });

    await act(async () => {
      await result.current.fetchLogs();
    });

    expect(result.current.fetchingLogs).toBe(false);
    expect(result.current.logsError).toBeNull();
    expect(result.current.logsFetched).toBe(true);
    expect(result.current.eventLogs).toHaveLength(1);
    expect(result.current.eventLogs[0].decodedName).toBe("Transfer");
  });
});

// ---------------------------------------------------------------------------
// fetchLogs — error / edge cases
// ---------------------------------------------------------------------------
describe("fetchLogs error cases", () => {
  it("sets logsError when no events are selected", async () => {
    const { result } = renderHook(() => useEventLogs(defaultParams));

    await act(async () => {
      await result.current.fetchLogs();
    });

    expect(result.current.logsError).toBe("Please select at least one event");
    expect(result.current.logsFetched).toBe(false);
  });

  it("sets logsError when address is invalid", async () => {
    const { result } = renderHook(() =>
      useEventLogs({ ...defaultParams, address: "not-an-address" }),
    );

    act(() => {
      result.current.toggleEventSelection("Transfer");
    });

    await act(async () => {
      await result.current.fetchLogs();
    });

    expect(result.current.logsError).toBe(
      "Please enter a valid contract address",
    );
  });

  it("sets logsError and calls onMissingApiKey when etherscan key absent", async () => {
    const onMissingApiKey = vi.fn();
    const { result } = renderHook(() =>
      useEventLogs({ ...defaultParams, apiKeys: {}, onMissingApiKey }),
    );

    act(() => {
      result.current.toggleEventSelection("Transfer");
    });

    await act(async () => {
      await result.current.fetchLogs();
    });

    expect(result.current.logsError).toMatch(/etherscan api key/i);
    expect(onMissingApiKey).toHaveBeenCalled();
  });

  it("sets logsError when API returns an error field", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({ error: "Rate limit exceeded" }),
      }),
    );

    const { result } = renderHook(() => useEventLogs(defaultParams));

    act(() => {
      result.current.toggleEventSelection("Transfer");
    });

    await act(async () => {
      await result.current.fetchLogs();
    });

    expect(result.current.logsError).toBe("Rate limit exceeded");
    expect(result.current.fetchingLogs).toBe(false);
  });
});
