import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useSourceCode } from "../../../app/contract-caller/hooks/useSourceCode.js";

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("useSourceCode", () => {
  it("returns loading=false and sources=null when address is null", () => {
    const { result } = renderHook(() => useSourceCode("ethereum", null));
    expect(result.current.loading).toBe(false);
    expect(result.current.sources).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("returns cached source immediately without fetching", () => {
    const sources = { "Token.sol": "contract Token {}" };
    localStorage.setItem(
      "src-ethereum-0x1234",
      JSON.stringify({
        sources,
        compilerVersion: "0.8.19",
        timestamp: Date.now(),
      }),
    );

    const { result } = renderHook(() => useSourceCode("ethereum", "0x1234"));
    expect(result.current.loading).toBe(false);
    expect(result.current.sources).toEqual(sources);
    expect(result.current.compilerVersion).toBe("0.8.19");
  });

  it("fetches source code from API on cache miss", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          sourceCode: { "Main.sol": "contract Main {}" },
          compilerVersion: "0.8.20",
        }),
      }),
    );

    const { result } = renderHook(() => useSourceCode("ethereum", "0xabc"));

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.sources).toEqual({ "Main.sol": "contract Main {}" });
    expect(result.current.compilerVersion).toBe("0.8.20");
    expect(result.current.error).toBeNull();
  });

  it("sets error when API returns no sourceCode", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ abi: [], sourceCode: null }),
      }),
    );

    const { result } = renderHook(() => useSourceCode("ethereum", "0xabc"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.sources).toBeNull();
    expect(result.current.error).toBe("No source code available");
  });

  it("sets error on network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network error")),
    );

    const { result } = renderHook(() => useSourceCode("ethereum", "0xabc"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.sources).toBeNull();
    expect(result.current.error).toBe("Network error");
  });

  it("caches fetched source code in localStorage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          sourceCode: { "C.sol": "contract C {}" },
          compilerVersion: "0.8.0",
        }),
      }),
    );

    const { result } = renderHook(() => useSourceCode("ethereum", "0xcache"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    const cached = JSON.parse(localStorage.getItem("src-ethereum-0xcache"));
    expect(cached.sources).toEqual({ "C.sol": "contract C {}" });
    expect(cached.compilerVersion).toBe("0.8.0");
    expect(cached.timestamp).toBeGreaterThan(0);
  });
});
