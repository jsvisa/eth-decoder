import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTokenMetadata } from "../../../app/contract-caller/hooks/useTokenMetadata.js";

// Transfer(address indexed from, address indexed to, uint256 value)
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const TOKEN_ADDRESS = "0x1234567890123456789012345678901234567890";
const CHAIN = "ethereum";
const CHAIN_ID = 1;

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("useTokenMetadata — initial state", () => {
  it("returns empty maps on mount", () => {
    const { result } = renderHook(() => useTokenMetadata(CHAIN, {}));
    expect(result.current.tokenSymbols).toEqual({});
    expect(result.current.tokenDecimals).toEqual({});
    expect(result.current.tokenPrices).toEqual({});
  });

  it("exposes the two fetch callbacks", () => {
    const { result } = renderHook(() => useTokenMetadata(CHAIN, {}));
    expect(typeof result.current.fetchTokenSymbolsForLogs).toBe("function");
    expect(typeof result.current.fetchTokenDataForSimulation).toBe("function");
  });
});

describe("useTokenMetadata — fetchTokenSymbolsForLogs happy path", () => {
  it("fetches symbol for a transfer-topic log and updates tokenSymbols", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ decoded: [{ value: "DAI" }] }),
      }),
    );

    const { result } = renderHook(() => useTokenMetadata(CHAIN, {}));

    const logs = [
      {
        address: TOKEN_ADDRESS,
        topics: [TRANSFER_TOPIC],
        data: "0x",
      },
    ];

    await act(async () => {
      await result.current.fetchTokenSymbolsForLogs(logs, CHAIN_ID);
    });

    expect(result.current.tokenSymbols[TOKEN_ADDRESS.toLowerCase()]).toBe(
      "DAI",
    );
  });

  it("uses cached symbol from localStorage and skips fetch", async () => {
    const addr = TOKEN_ADDRESS.toLowerCase();
    localStorage.setItem(`token-symbol-${CHAIN}-${addr}`, "USDC");

    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    const { result } = renderHook(() => useTokenMetadata(CHAIN, {}));

    const logs = [
      {
        address: TOKEN_ADDRESS,
        topics: [TRANSFER_TOPIC],
        data: "0x",
      },
    ];

    await act(async () => {
      await result.current.fetchTokenSymbolsForLogs(logs, CHAIN_ID);
    });

    expect(mockFetch).not.toHaveBeenCalled();
    // tokenSymbols state is not pre-populated from cache (cache is only used to
    // skip network fetch); the cached value lives in localStorage.
    expect(localStorage.getItem(`token-symbol-${CHAIN}-${addr}`)).toBe("USDC");
  });

  it("does nothing when logs is empty", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
    const { result } = renderHook(() => useTokenMetadata(CHAIN, {}));

    await act(async () => {
      await result.current.fetchTokenSymbolsForLogs([], CHAIN_ID);
    });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.tokenSymbols).toEqual({});
  });
});

describe("useTokenMetadata — fetchTokenDataForSimulation happy path", () => {
  it("fetches decimals and price for a log token address", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url, _opts) => {
        if (typeof url === "string" && url.startsWith("/api/token-price")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ price: 1.0 }),
          });
        }
        // call-contract for decimals
        return Promise.resolve({
          ok: true,
          json: async () => ({ decoded: [{ value: "18" }] }),
        });
      }),
    );

    const { result } = renderHook(() => useTokenMetadata(CHAIN, {}));

    const logs = [
      {
        address: TOKEN_ADDRESS,
        topics: [TRANSFER_TOPIC],
        data: "0x",
      },
    ];

    await act(async () => {
      await result.current.fetchTokenDataForSimulation(
        logs,
        null,
        null,
        CHAIN_ID,
      );
    });

    const addr = TOKEN_ADDRESS.toLowerCase();
    expect(result.current.tokenDecimals[addr]).toBe(18);
    expect(result.current.tokenPrices[addr]).toBe(1.0);
  });
});

describe("useTokenMetadata — error handling", () => {
  it("tolerates a failed fetch and leaves state empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network error")),
    );

    const { result } = renderHook(() => useTokenMetadata(CHAIN, {}));

    const logs = [
      {
        address: TOKEN_ADDRESS,
        topics: [TRANSFER_TOPIC],
        data: "0x",
      },
    ];

    await act(async () => {
      await result.current.fetchTokenSymbolsForLogs(logs, CHAIN_ID);
    });

    expect(result.current.tokenSymbols).toEqual({});
  });

  it("adds native token price when balanceChanges is present", async () => {
    const NATIVE = "0x0000000000000000000000000000000000000000";
    vi.stubGlobal(
      "fetch",
      vi.fn((url) => {
        if (typeof url === "string" && url.includes(NATIVE)) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ price: 2500 }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ price: null }),
        });
      }),
    );

    const { result } = renderHook(() => useTokenMetadata(CHAIN, {}));

    await act(async () => {
      await result.current.fetchTokenDataForSimulation(
        null,
        null,
        [{ address: "0xabc", diff: "1000000000000000000" }],
        CHAIN_ID,
      );
    });

    expect(result.current.tokenPrices[NATIVE]).toBe(2500);
  });
});
