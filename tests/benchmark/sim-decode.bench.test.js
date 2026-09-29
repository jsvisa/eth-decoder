// Post-execution log-decode benchmark.
//
// tryDecodeLog falls back to "try every event ABI we know about" for logs whose
// emitting address has no cached ABI, which is the common case: a swap touches
// tokens and routers the app has no ABI for. That fallback rebuilds a flattened
// array of every known event on every log and relies on a thrown exception per
// miss, so cost grows as logs x known-events.
//
// The recorded LiFi fixture only produces 11 logs against a single event ABI,
// so it cannot show this. Here the same simulation is replayed with a
// realistic-sized abiCache — the shape the app builds after a few minutes of
// use, where dozens of contract ABIs are cached — and the decode phase
// (wall time minus the prefetch/execution phases the metrics collector
// already reports) is compared.
import { describe, it, expect, afterAll } from "vitest";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { assertNoCacheMisses, createFileRpcCache } from "./rpcCache.mjs";
import { simulateWithTevm } from "../../app/utils/tevmSimulator.js";

const RPC = process.env.SIM_BENCH_RPC_URL;
const RUNS = Math.max(1, Number(process.env.SIM_BENCH_RUNS || 3));
// 0 disables the enlarged cache, giving a same-harness control.
const CACHED_ABIS = Number(process.env.SIM_BENCH_ABIS ?? 40);
const CACHE_PATH = fileURLToPath(
  new URL("./__fixtures__/rpc-cache.json", import.meta.url),
);
const HAS_CACHE = existsSync(CACHE_PATH);

const recordingCache = createFileRpcCache(CACHE_PATH, { rpcUrl: RPC });
afterAll(() => recordingCache.flush());

const fixture = JSON.parse(
  await readFile(
    new URL("./__fixtures__/worldchain-swap.json", import.meta.url),
    "utf8",
  ),
);

// A mixed bag of real-world event shapes: indexed-heavy signatures, anonymous
// events, and no-parameter events, so the scan can't be trivially short-circuited.
const EVENT_ABI = [
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Approval",
    inputs: [
      { name: "owner", type: "address", indexed: true },
      { name: "spender", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Swap",
    inputs: [
      { name: "sender", type: "address", indexed: true },
      { name: "amount0In", type: "uint256", indexed: false },
      { name: "amount1In", type: "uint256", indexed: false },
      { name: "amount0Out", type: "uint256", indexed: false },
      { name: "amount1Out", type: "uint256", indexed: false },
      { name: "to", type: "address", indexed: true },
    ],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
];

// Addresses the simulation never touched, so every one of them lands in the
// fallback candidate list without being able to short-circuit a decode.
function buildAbiCache(count) {
  const map = new Map();
  for (let i = 0; i < count; i++) {
    const hex = (i + 1).toString(16).padStart(40, "0");
    map.set(`0x${hex}`, EVENT_ABI);
  }
  return map;
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

describe("post-execution log-decode benchmark", () => {
  it.skipIf(!RPC && !HAS_CACHE)(
    `decodes the fixture's logs against ${CACHED_ABIS} cached contract ABIs`,
    async () => {
      const run = async (abiCount) => {
        // Uses the rpcDecorator hook rather than a fetch override so the same
        // benchmark runs against any revision of the simulator.
        // This benchmark replays rpc-cache.json, which models an RPC with no
        // eth_createAccessList support.
        const cache = createFileRpcCache(CACHE_PATH, {
          rpcUrl: RPC,
          unsupported: ["eth_createAccessList"],
        });
        const t0 = performance.now();
        const result = await simulateWithTevm({
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
          stepHookMode: "sync",
          parallelPrefetch: true,
          abiCache: buildAbiCache(abiCount),
          rpcDecorator: cache.decorator,
        });
        const wallMs = performance.now() - t0;
        // A stale fixture does not fail loudly on its own — see assertNoCacheMisses.
        assertNoCacheMisses("log-decode bench", cache.missKeys);
        const { prefetchMs = 0, executionMs = 0 } = result.metrics.phases;
        return {
          wallMs,
          // Everything that is not fork-state I/O or EVM execution: trace
          // assembly, log decoding, re-decoding and result shaping.
          decodeMs: wallMs - prefetchMs - executionMs,
          logs: (result.logs || []).length,
          decoded: (result.logs || []).filter((l) => l.decoded).length,
          success: result.success,
          gasUsed: result.gasUsed,
        };
      };

      const summary = [];
      for (const abiCount of [0, CACHED_ABIS]) {
        const warm = await run(abiCount);
        expect(warm.success, "sim failed").toBe(true);
        const runs = [];
        for (let i = 0; i < RUNS; i++) runs.push(await run(abiCount));
        summary.push({
          "cached ABIs": abiCount,
          "wall med (ms)": Math.round(median(runs.map((r) => r.wallMs))),
          "decode med (ms)": Math.round(median(runs.map((r) => r.decodeMs))),
          "decode min (ms)": Math.round(
            Math.min(...runs.map((r) => r.decodeMs)),
          ),
          logs: warm.logs,
          decoded: warm.decoded,
        });
      }

      const line =
        `cachedAbis=${CACHED_ABIS} runs=${RUNS} logs=${summary[1].logs}\n` +
        "cachedABIs\twallMed\tdecodeMed\tdecodeMin\tlogs\tdecoded\n" +
        summary
          .map((s) =>
            [
              s["cached ABIs"],
              s["wall med (ms)"],
              s["decode med (ms)"],
              s["decode min (ms)"],
              s.logs,
              s.decoded,
            ].join("\t"),
          )
          .join("\n");
      console.log("\nDECODE\n" + line);
      if (process.env.SIM_BENCH_OUT)
        await writeFile(process.env.SIM_BENCH_OUT, line + "\n");
    },
    30 * 60_000,
  );
});
