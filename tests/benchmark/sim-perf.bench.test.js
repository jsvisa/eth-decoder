import { describe, it, expect } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import { Worker } from "node:worker_threads";
import { simulateWithTevm } from "../../app/utils/tevmSimulator.js";

// Simulation performance benchmark — decides between step-hook / prefetch /
// worker execution strategies on a real fork.
//
// Run with:
//   SIM_BENCH_RPC_URL=<worldchain rpc> npx vitest run --project benchmark
//
// Uses the pinned calldata in ./__fixtures__/worldchain-swap.json (see
// generate-fixture.test.js). Every variant replays the SAME call at the SAME
// pinned block, so wall-clock differences isolate the implementation change.
// Each variant must produce an identical fingerprint (success/gas/logs/trace)
// or its numbers are rejected.

const RPC = process.env.SIM_BENCH_RPC_URL;
const RUNS = Math.max(1, Number(process.env.SIM_BENCH_RUNS || 3));

const fixture = JSON.parse(
  await readFile(
    new URL("./__fixtures__/worldchain-swap.json", import.meta.url),
    "utf8",
  ),
);

const baseParams = (over = {}) => ({
  chain: fixture.chainName,
  customChainId: fixture.chainId,
  rpcUrl: RPC,
  blockNumber: fixture.block,
  address: fixture.to,
  fromAddress: fixture.from,
  value: fixture.valueWei,
  valueUnit: "Wei",
  callData: fixture.data,
  abi: fixture.abi,
  rpcBatchSize: 1,
  // Mirror the UI's sender-funding override; the real wallet is unfunded.
  balanceOverrides: [{ address: fixture.from, balance: "10" }],
  ...over,
});

const VARIANTS = [
  { name: "baseline (async hook, seq prefetch)", params: {} },
  { name: "A: sync step hook", params: { stepHookMode: "sync" } },
  { name: "B: parallel prefetch", params: { parallelPrefetch: true } },
  {
    name: "A+B: sync hook + parallel prefetch",
    params: { stepHookMode: "sync", parallelPrefetch: true },
  },
];

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
  const t0 = performance.now();
  const result = await simulateWithTevm(baseParams(params));
  const wallMs = performance.now() - t0;
  return {
    wallMs,
    prefetchMs: result.metrics.phases.prefetchMs,
    executionMs: result.metrics.phases.executionMs,
    lazyLoadMs: result.metrics.phases.lazyLoadMs,
    ...fingerprint(result),
  };
}

function runInWorker(params) {
  const sab = new SharedArrayBuffer(4);
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./sim-worker.mjs", import.meta.url), {
      workerData: { params: baseParams(params), sab },
    });
    const t0 = performance.now();
    worker.on("message", (msg) => {
      if (msg.type === "done") {
        const r = msg.result;
        resolve({
          wallMs: performance.now() - t0,
          prefetchMs: r.metrics.phases.prefetchMs,
          executionMs: r.metrics.phases.executionMs,
          lazyLoadMs: r.metrics.phases.lazyLoadMs,
          ...fingerprint(r),
        });
      } else if (msg.type === "error") {
        reject(new Error(msg.message));
      }
    });
    worker.on("error", reject);
    worker.on("exit", (code) => {
      if (code !== 0) reject(new Error(`worker exited with code ${code}`));
    });
  });
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const min = (xs) => Math.min(...xs);

describe("simulation performance benchmark", () => {
  it.skipIf(!RPC)(
    "compares hook / prefetch / worker strategies on the pinned fixture",
    async () => {
      const summary = [];

      for (const variant of VARIANTS) {
        // Warmup (JIT + module caches), excluded from stats
        const warm = await runOnce(variant.params);
        if (!warm.success) {
          throw new Error(
            `${variant.name}: warmup sim failed — fixture expired? ${warm.error || ""}`,
          );
        }
        const runs = [];
        for (let i = 0; i < RUNS; i++) {
          runs.push(await runOnce(variant.params));
        }
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
          "wall min (ms)": Math.round(min(runs.map((r) => r.wallMs))),
          "prefetch med": Math.round(median(runs.map((r) => r.prefetchMs))),
          "exec med": Math.round(median(runs.map((r) => r.executionMs))),
          "lazy med": Math.round(median(runs.map((r) => r.lazyLoadMs))),
        });
        console.log(
          `\n${variant.name}:`,
          runs.map((r) => Math.round(r.wallMs)),
        );
      }

      // Variant C: best config (A+B) run on a worker thread
      {
        const workerParams = VARIANTS[3].params;
        const warm = await runInWorker(workerParams);
        if (!warm.success) {
          throw new Error("worker warmup sim failed");
        }
        const runs = [];
        for (let i = 0; i < RUNS; i++)
          runs.push(await runInWorker(workerParams));
        summary.push({
          variant: "C: worker thread (sync hook)",
          "wall med (ms)": Math.round(median(runs.map((r) => r.wallMs))),
          "wall min (ms)": Math.round(min(runs.map((r) => r.wallMs))),
          "prefetch med": Math.round(median(runs.map((r) => r.prefetchMs))),
          "exec med": Math.round(median(runs.map((r) => r.executionMs))),
          "lazy med": Math.round(median(runs.map((r) => r.lazyLoadMs))),
        });
        console.log(
          "\nC: worker thread (sync hook):",
          runs.map((r) => Math.round(r.wallMs)),
        );
      }

      console.table(summary);

      // vitest's default reporter swallows console output from passing tests,
      // so also persist the table for later inspection.
      const out = process.env.SIM_BENCH_OUT;
      const rendered =
        `${new Date().toISOString()} runs=${RUNS} block=${fixture.block}\n` +
        summary
          .map(
            (s) =>
              `${s.variant}\t${s["wall med (ms)"]}\t${s["wall min (ms)"]}\t` +
              `${s["prefetch med"]}\t${s["exec med"]}\t${s["lazy med"]}`,
          )
          .join("\n") +
        "\n(header: variant, wall med, wall min, prefetch med, exec med, lazy med)\n";
      if (out) await writeFile(out, rendered);
      console.log(rendered);
    },
    30 * 60_000,
  );
});
