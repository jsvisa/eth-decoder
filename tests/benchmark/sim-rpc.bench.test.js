// Cold-path round-trip benchmark.
//
// The offline sim-perf benchmark replays from a local file, so every RPC
// answers in microseconds. That hides the dominant real-world cost of a cold
// simulation: tevm resolves fork state through a long chain of *sequential*
// JSON-RPC round-trips, so wall time is roughly `roundTrips x rttMs`. Reducing
// round-trips is the single biggest lever, and the CPU benchmark is blind to
// it.
//
// This benchmark replays the same pinned fixture with an injected per-request
// latency (SIM_BENCH_RTT_MS, default 25ms — a conservative public-RPC RTT) and
// reports wall time *and* the round-trip census per variant, so a regression in
// round-trip count is visible even if a faster network hides it.
//
// Every variant must produce an identical fingerprint or its numbers are
// rejected, exactly as in sim-perf.bench.test.js.
import { describe, it, expect, afterAll } from "vitest";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  assertNoCacheMisses,
  createFileRpcCache,
  createReplayFetch,
} from "./rpcCache.mjs";
import { simulateWithTevm } from "../../app/utils/tevmSimulator.js";

const RPC = process.env.SIM_BENCH_RPC_URL;
const RUNS = Math.max(1, Number(process.env.SIM_BENCH_RUNS || 3));
const RTT_MS = Number(process.env.SIM_BENCH_RTT_MS ?? 25);

// Two recorded fixtures for the same transaction, differing only in what the
// RPC supports:
//   rpc-cache.json            — no eth_createAccessList, so the prefetch
//                               degrades to the eth_estimateGas denominator
//   rpc-cache-accesslist.json — adds a recorded eth_createAccessList covering
//                               the 6 accounts / 26 slots the tx really touches,
//                               which is what most production RPCs (Alchemy,
//                               QuickNode, Infura) return. This is the fixture
//                               that actually exercises the prefetch path.
const CACHE_NAME = process.env.SIM_BENCH_CACHE || "rpc-cache.json";
const CACHE_PATH = fileURLToPath(
  new URL(`./__fixtures__/${CACHE_NAME}`, import.meta.url),
);
const HAS_CACHE = existsSync(CACHE_PATH);

// rpc-cache.json models an RPC with no eth_createAccessList support, so that
// method is expected to fail rather than being read as a fixture gap. The
// access-list fixture serves it.
const UNSUPPORTED =
  CACHE_NAME === "rpc-cache-accesslist.json" ? [] : ["eth_createAccessList"];

const recordingCache = createFileRpcCache(CACHE_PATH, { rpcUrl: RPC });
afterAll(() => recordingCache.flush());

const fixture = JSON.parse(
  await readFile(
    new URL("./__fixtures__/worldchain-swap.json", import.meta.url),
    "utf8",
  ),
);

const baseParams = (over = {}) => ({
  chain: fixture.chainName,
  customChainId: fixture.chainId,
  rpcUrl: RPC || "http://rpc-cache.invalid",
  blockNumber: fixture.block,
  address: fixture.to,
  fromAddress: fixture.from,
  value: fixture.valueWei,
  valueUnit: "Wei",
  callData: fixture.data,
  abi: fixture.abi,
  rpcBatchSize: 1,
  balanceOverrides: [{ address: fixture.from, balance: "10" }],
  ...over,
});

function fingerprint(result) {
  const countNodes = (node) =>
    node ? 1 + (node.calls || []).reduce((n, c) => n + countNodes(c), 0) : 0;
  return {
    success: result.success,
    gasUsed: result.gasUsed,
    logCount: (result.logs || []).length,
    traceNodes: countNodes(result.callTrace),
    rawDataLen: (result.rawData || "0x").length,
  };
}

async function runOnce(params) {
  const stats = { roundTrips: 0, logicalCalls: 0 };
  // Held as an object, not destructured: `missKeys` and `roundTrips` are
  // getters that snapshot on access, so destructuring them here would capture
  // empty arrays before the run and the miss assertion below would pass
  // vacuously.
  const replay = createReplayFetch(CACHE_PATH, {
    rttMs: RTT_MS,
    stats,
    unsupported: UNSUPPORTED,
  });
  const { fetchFn, roundTrips } = replay;
  const t0 = performance.now();
  const result = await simulateWithTevm(
    baseParams({ ...params, rpcFetch: fetchFn }),
  );
  const wallMs = performance.now() - t0;
  // A stale fixture does not fail loudly on its own — see assertNoCacheMisses.
  assertNoCacheMisses(`cold-path bench [${CACHE_NAME}]`, replay.missKeys);

  // Round-trip census. `roundTrips` is real HTTP round-trips (what latency is
  // actually paid); `logicalCalls` is JSON-RPC requests issued. The gap between
  // them is exactly what batching bought.
  const byMethod = {};
  for (const trip of roundTrips) {
    for (const method of trip.methods) {
      byMethod[method] = (byMethod[method] || 0) + 1;
    }
  }

  return {
    wallMs,
    roundTrips: stats.roundTrips,
    logicalCalls: stats.logicalCalls,
    ...fingerprint(result),
    byMethod,
  };
}

const VARIANTS = [
  { name: "baseline (batch=1, seq prefetch)", params: {} },
  { name: "batch=10", params: { rpcBatchSize: 10 } },
  { name: "parallel prefetch", params: { parallelPrefetch: true } },
  {
    name: "parallel prefetch + batch=10",
    params: { parallelPrefetch: true, rpcBatchSize: 10 },
  },
];

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

describe("cold-path RPC round-trip benchmark", () => {
  it.skipIf(!RPC && !HAS_CACHE)(
    "measures round-trips on the pinned fixture under injected latency",
    async () => {
      const summary = [];

      for (const variant of VARIANTS) {
        const warm = await runOnce(variant.params);
        expect(warm.success, `${variant.name}: warmup sim failed`).toBe(true);

        const runs = [];
        for (let i = 0; i < RUNS; i++) runs.push(await runOnce(variant.params));

        const pick = (r) => ({
          success: r.success,
          gasUsed: r.gasUsed,
          logCount: r.logCount,
          traceNodes: r.traceNodes,
          rawDataLen: r.rawDataLen,
        });
        for (const r of runs) {
          expect(pick(r), `${variant.name} fingerprint drift`).toEqual(
            pick(warm),
          );
        }

        summary.push({
          variant: variant.name,
          "wall med (ms)": Math.round(median(runs.map((r) => r.wallMs))),
          "wall min (ms)": Math.round(Math.min(...runs.map((r) => r.wallMs))),
          "http round-trips": warm.roundTrips,
          "rpc calls": warm.logicalCalls,
          getCode: warm.byMethod.eth_getCode || 0,
          getBalance: warm.byMethod.eth_getBalance || 0,
          getStorage: warm.byMethod.eth_getStorageAt || 0,
          estimateGas: warm.byMethod.eth_estimateGas || 0,
          accessList: warm.byMethod.eth_createAccessList || 0,
        });
      }

      const rows = summary
        .map((s) =>
          [
            s.variant,
            s["wall med (ms)"],
            s["wall min (ms)"],
            s["http round-trips"],
            s["rpc calls"],
            s.getCode,
            s.getBalance,
            s.getStorage,
            s.estimateGas,
            s.accessList,
          ].join("\t"),
        )
        .join("\n");
      console.log(
        `\nRTT=${RTT_MS}ms runs=${RUNS}\n` +
          "variant\twallMed\twallMin\thttpRoundTrips\trpcCalls\tgetCode\tgetBalance\tgetStorage\testimateGas\taccessList\n" +
          rows,
      );
      if (process.env.SIM_BENCH_OUT) {
        await writeFile(
          process.env.SIM_BENCH_OUT,
          `RTT=${RTT_MS}ms runs=${RUNS} block=${fixture.block} cache=${CACHE_NAME}\n` +
            "variant\twallMed\twallMin\thttpRoundTrips\trpcCalls\tgetCode\tgetBalance\tgetStorage\testimateGas\taccessList\n" +
            rows +
            "\n",
        );
      }
    },
    30 * 60_000,
  );
});
