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
//
// Options:
//   rpcUrl     — when set, cache misses hit the live RPC and are recorded.
//   readOnly   — throw on miss instead of reaching for the network.
//   rttMs      — artificial per-request round-trip latency, in ms. Replay from
//                a local file is otherwise sub-microsecond, which hides the
//                dominant real-world cost: a cold simulation is a long chain of
//                *sequential* JSON-RPC round-trips, so wall time is roughly
//                `roundTrips x rttMs`. Injecting latency makes the benchmark
//                sensitive to the number and ordering of round-trips, which is
//                what actually changes between variants. Defaults to 0 so the
//                existing CPU-focused benchmark behaviour is unchanged.
//   onRequest  — observer called with (method, key) for every request; used by
//                the benchmark to census round-trips per phase.
//
// MISSES MUST BE ASSERTED ON, NOT JUST THROWN. A miss throws here, but tevm
// catches transport errors internally and viem then retries with backoff, so a
// fixture that under-covers a code path does not fail loudly — it silently
// costs ~30ms per miss. That is how a recording made from the old code path
// produced a plausible-looking 7x speedup that was really 34 cached responses
// being re-fetched. `stats.missKeys` exists so every benchmark can assert on it.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createFileRpcCache(
  filePath,
  {
    rpcUrl = null,
    readOnly = false,
    rttMs = 0,
    onRequest = null,
    unsupported = [],
  } = {},
) {
  let cache = existsSync(filePath)
    ? JSON.parse(readFileSync(filePath, "utf8"))
    : {};
  const unsupportedMethods = new Set(unsupported);
  let dirty = false;
  let hits = 0;
  let misses = 0;
  // Deduped: a retried miss is one gap in the fixture, not several.
  const missKeys = new Set();
  let unsupportedCalls = 0;

  return {
    decorator: async (req, doFetch) => {
      const key = `${req.method}|${JSON.stringify(req.params ?? [])}`;
      if (onRequest) onRequest(req.method, key);
      if (rttMs > 0) await sleep(rttMs);
      if (key in cache) {
        hits += 1;
        return cache[key];
      }
      if (unsupportedMethods.has(req.method)) {
        // Modelled as a JSON-RPC "method not found" rather than a cache gap, so
        // it takes the same path a real RPC without this method takes.
        unsupportedCalls += 1;
        const e = new Error(`${req.method} is not supported by this RPC`);
        e.code = -32601;
        throw e;
      }
      misses += 1;
      missKeys.add(key);
      if (readOnly || !rpcUrl) {
        throw new Error(
          `RPC cache miss for ${req.method} and SIM_BENCH_RPC_URL is not set. ` +
            "Re-record the cache: SIM_BENCH_RPC_URL=<rpc> npm run benchmark",
        );
      }
      const result = await doFetch(req);
      cache[key] = result;
      dirty = true;
      return result;
    },
    flush() {
      if (dirty) writeFileSync(filePath, JSON.stringify(cache));
      dirty = false;
    },
    get missKeys() {
      return [...missKeys];
    },
    get stats() {
      return {
        hits,
        misses,
        unsupportedCalls,
        size: Object.keys(cache).length,
      };
    },
  };
}

// A whole transport backed by a fetch function, i.e. a fake node.
//
// This sits *below* viem's JSON-RPC batcher, so it is invoked once per actual
// HTTP round-trip rather than once per logical request. That distinction is the
// whole point: injecting latency per logical request serialises everything and
// makes batching look worthless, when in reality batching is what collapses N
// round-trips into one.
export function createReplayFetch(
  cachePath,
  { rttMs = 0, stats = null, unsupported = [] } = {},
) {
  const cache = existsSync(cachePath)
    ? JSON.parse(readFileSync(cachePath, "utf8"))
    : {};
  const unsupportedMethods = new Set(unsupported);
  const roundTrips = [];
  // See the note above: a miss must be asserted on, because viem retries a
  // JSON-RPC error and turns a fixture gap into ~30ms of silent backoff.
  const missKeys = new Set();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // viem invokes `fetchFn(url, init)`, so the payload arrives in `init.body`
  // as an already-stringified JSON-RPC request (or array of them).
  const fetchFn = async (_url, init) => {
    const body = JSON.parse(init.body);
    const batch = Array.isArray(body) ? body : [body];
    if (rttMs > 0) await sleep(rttMs);
    const calls = batch.length;
    roundTrips.push({
      calls,
      methods: batch.map((c) => c.method),
      params: batch.map((c) => c.params ?? []),
    });

    const results = batch.map((call) => {
      const key = `${call.method}|${JSON.stringify(call.params ?? [])}`;
      if (key in cache) {
        return { jsonrpc: "2.0", id: call.id, result: cache[key] };
      }
      if (unsupportedMethods.has(call.method)) {
        return {
          jsonrpc: "2.0",
          id: call.id,
          error: { code: -32601, message: `${call.method} not supported` },
        };
      }
      missKeys.add(key);
      return {
        jsonrpc: "2.0",
        id: call.id,
        error: {
          code: -32000,
          message: `RPC cache miss for ${call.method}; re-record with SIM_BENCH_RPC_URL`,
        },
      };
    });

    if (stats) {
      stats.roundTrips += 1;
      stats.logicalCalls += calls;
    }
    return new Response(
      JSON.stringify(Array.isArray(body) ? results : results[0]),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  };

  return {
    fetchFn,
    get roundTrips() {
      return roundTrips;
    },
    get missKeys() {
      return [...missKeys];
    },
  };
}

// Throws when a replay served fewer responses than were asked for.
//
// A fixture that under-covers a code path does not surface as an error: tevm
// catches the transport failure and viem retries it with backoff, so the
// benchmark still "passes" and still returns a plausible wall time — just one
// inflated by ~30ms per missing response. Every replay-based benchmark must
// call this so a stale fixture fails instead of quietly lying.
export function assertNoCacheMisses(label, missKeys) {
  if (missKeys.length === 0) return;
  const byMethod = {};
  for (const key of missKeys) {
    const method = key.split("|")[0];
    byMethod[method] = (byMethod[method] || 0) + 1;
  }
  throw new Error(
    `${label}: replay cache under-covers this code path — ` +
      `${missKeys.length} distinct missing response(s) ${JSON.stringify(byMethod)}.\n` +
      `A miss here is not a clean failure: on the rpcDecorator path viem treats ` +
      `the thrown error as a transport fault and retries it with backoff (~30ms ` +
      `each), so the wall time above is inflated rather than the run failing.\n` +
      `If this method is genuinely unsupported by the modelled RPC, declare it: ` +
      `pass { unsupported: ["<method>"] } instead of letting it read as a gap.\n` +
      `First miss: ${missKeys[0].slice(0, 160)}\n` +
      `Re-record the fixture:\n` +
      `  SIM_BENCH_RPC_URL=<rpc> npx vitest run --project benchmark tests/benchmark/generate-fixture.test.js`,
  );
}
