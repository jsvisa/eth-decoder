import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

let useSourceCode;

beforeEach(async () => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.resetModules();
  const mod =
    await import("../../../app/contract-caller/hooks/useSourceCode.js");
  useSourceCode = mod.useSourceCode;
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

  it("dedup path: both instances receive same error message on failure", async () => {
    let rejectFetch;
    const fetchPromise = new Promise((_, reject) => {
      rejectFetch = reject;
    });
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(fetchPromise));

    const { result: result1 } = renderHook(() =>
      useSourceCode("ethereum", "0xdedupErr"),
    );
    const { result: result2 } = renderHook(() =>
      useSourceCode("ethereum", "0xdedupErr"),
    );

    expect(result1.current.loading).toBe(true);
    expect(result2.current.loading).toBe(true);

    rejectFetch(new Error("Network error"));

    await waitFor(() => expect(result1.current.loading).toBe(false));
    await waitFor(() => expect(result2.current.loading).toBe(false));

    expect(result1.current.error).toBe("Network error");
    expect(result2.current.error).toBe("Network error");
  });

  it("dedup path: both instances receive same source code on success", async () => {
    let resolveFetch;
    const fetchPromise = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(fetchPromise));

    const { result: result1 } = renderHook(() =>
      useSourceCode("ethereum", "0xdedupOk"),
    );
    const { result: result2 } = renderHook(() =>
      useSourceCode("ethereum", "0xdedupOk"),
    );

    expect(result1.current.loading).toBe(true);
    expect(result2.current.loading).toBe(true);

    resolveFetch({
      ok: true,
      json: async () => ({
        sourceCode: { "Dedup.sol": "contract Dedup {}" },
        compilerVersion: "0.8.21",
      }),
    });

    await waitFor(() => expect(result1.current.loading).toBe(false));
    await waitFor(() => expect(result2.current.loading).toBe(false));

    expect(result1.current.sources).toEqual({
      "Dedup.sol": "contract Dedup {}",
    });
    expect(result2.current.sources).toEqual({
      "Dedup.sol": "contract Dedup {}",
    });
    expect(result1.current.compilerVersion).toBe("0.8.21");
    expect(result2.current.compilerVersion).toBe("0.8.21");
  });
});
