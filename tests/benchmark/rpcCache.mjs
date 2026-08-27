// File-backed RPC record/replay cache for the benchmark suite.
//
// Recording (needs a live RPC):
//   SIM_BENCH_RPC_URL=<worldchain rpc> npm run benchmark
// Replaying (fully offline, deterministic — what CI / later re-runs do):
//   npm run benchmark
//
// The decorator sits inside tevmSimulator's raw transport layer, so every
// JSON-RPC request (fork state loads + prefetch) is keyed by
// `method|JSON(params)` and served from the committed cache file on hit.
// Responses at a pinned block are deterministic, so replay results are
// byte-identical to the recorded ones.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

export function createFileRpcCache(
  filePath,
  { rpcUrl = null, readOnly = false } = {},
) {
  let cache = existsSync(filePath)
    ? JSON.parse(readFileSync(filePath, "utf8"))
    : {};
  let dirty = false;
  let hits = 0;
  let misses = 0;

  return {
    decorator: async (req, doFetch) => {
      const key = `${req.method}|${JSON.stringify(req.params ?? [])}`;
      if (key in cache) {
        hits += 1;
        return cache[key];
      }
      if (readOnly || !rpcUrl) {
        misses += 1;
        throw new Error(
          `RPC cache miss for ${req.method} and SIM_BENCH_RPC_URL is not set. ` +
            "Re-record the cache: SIM_BENCH_RPC_URL=<rpc> npm run benchmark",
        );
      }
      const result = await doFetch(req);
      cache[key] = result;
      dirty = true;
      misses += 1;
      return result;
    },
    flush() {
      if (dirty) writeFileSync(filePath, JSON.stringify(cache));
      dirty = false;
    },
    get stats() {
      return { hits, misses, size: Object.keys(cache).length };
    },
  };
}
