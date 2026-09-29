// The benchmark's only defence against a stale fixture is that it fails loudly.
// That defence has to keep working, so it gets its own test.
import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertNoCacheMisses,
  createFileRpcCache,
  createReplayFetch,
} from "./rpcCache.mjs";

function fixture(entries) {
  const dir = mkdtempSync(join(tmpdir(), "sim-bench-"));
  const path = join(dir, "rpc-cache.json");
  writeFileSync(path, JSON.stringify(entries));
  return path;
}

describe("replay cache miss detection", () => {
  it("serves hits without reporting them as gaps", async () => {
    const path = fixture({ 'eth_getCode|["0xaa","0x1"]': "0x6000" });
    const cache = createFileRpcCache(path, {});
    const result = await cache.decorator({
      method: "eth_getCode",
      params: ["0xaa", "0x1"],
    });
    expect(result).toBe("0x6000");
    expect(cache.missKeys).toEqual([]);
    expect(() => assertNoCacheMisses("test", cache.missKeys)).not.toThrow();
  });

  it("reports a genuine gap and fails with an actionable message", async () => {
    const path = fixture({});
    const cache = createFileRpcCache(path, {});
    await expect(
      cache.decorator({ method: "eth_getCode", params: ["0xbb", "0x1"] }),
    ).rejects.toThrow(/cache miss/);
    expect(cache.missKeys).toHaveLength(1);
    expect(() => assertNoCacheMisses("test", cache.missKeys)).toThrow(
      /under-covers this code path[\s\S]*eth_getCode[\s\S]*Re-record the fixture/,
    );
  });

  it("treats a declared unsupported method as expected, not a gap", async () => {
    const path = fixture({});
    const cache = createFileRpcCache(path, {
      unsupported: ["eth_createAccessList"],
    });
    await expect(
      cache.decorator({ method: "eth_createAccessList", params: [{}] }),
    ).rejects.toThrow(/not supported by this RPC/);
    expect(cache.missKeys).toEqual([]);
    expect(cache.stats.unsupportedCalls).toBe(1);
    expect(() => assertNoCacheMisses("test", cache.missKeys)).not.toThrow();
  });

  it("returns a JSON-RPC error for unsupported methods on the fetch path", async () => {
    const path = fixture({});
    const replay = createReplayFetch(path, {
      unsupported: ["eth_createAccessList"],
    });
    const res = await replay.fetchFn("http://x", {
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_createAccessList",
        params: [],
      }),
    });
    const body = await res.json();
    expect(body.error.code).toBe(-32601);
    expect(replay.missKeys).toEqual([]);
  });

  it("reports gaps on the fetch path too", async () => {
    const path = fixture({});
    const replay = createReplayFetch(path, {});
    await replay.fetchFn("http://x", {
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getBalance",
        params: ["0xcc", "0x1"],
      }),
    });
    expect(replay.missKeys).toHaveLength(1);
    expect(() => assertNoCacheMisses("test", replay.missKeys)).toThrow(
      /under-covers this code path/,
    );
  });

  it("exposes missKeys live, so a caller cannot capture a stale snapshot", async () => {
    const path = fixture({});
    const replay = createReplayFetch(path, {});
    // Reads before the run, as a destructuring caller would.
    const early = replay.missKeys;
    expect(early).toEqual([]);
    await replay.fetchFn("http://x", {
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getBalance",
        params: ["0xdd", "0x1"],
      }),
    });
    // The array captured earlier is a snapshot and stays empty; that is exactly
    // why callers must hold the cache object, not a destructured field.
    expect(early).toEqual([]);
    expect(replay.missKeys).toHaveLength(1);
  });
});
