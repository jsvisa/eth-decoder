import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { simulateWithTevm } from "../../app/utils/tevmSimulator.js";

// Regression test for the simulation progress bar.
//
// The old progress model never fired for diamond-proxy txs: it sampled gas
// only at depth 0 (a LiFi diamond DELEGATECALLs immediately — 55 root opcodes
// out of the whole run) and divided by the root frame's gas limit (tevm sets
// that to the block maximum, ~280M vs ~293K actually used). Result: zero
// updates for the entire simulation.
//
// The new model tracks gas across all active frames and divides by the tx's
// real gas usage reported by the RPC (eth_createAccessList gasUsed, or an
// eth_estimateGas dry run with the sender's balance overridden). Run with:
//   SIM_BENCH_RPC_URL=<worldchain rpc> npx vitest run --project benchmark
//
// NOTE: the fixture calldata embeds quote deadlines; regenerate it (see
// generate-fixture.test.js) if the sim starts reverting.

const RPC = process.env.SIM_BENCH_RPC_URL;

const fixture = JSON.parse(
  await readFile(
    new URL("./__fixtures__/worldchain-swap.json", import.meta.url),
    "utf8",
  ),
);

describe("simulation progress reporting", () => {
  it.skipIf(!RPC)(
    "reports a monotonic, meaningful trajectory for a diamond-proxy tx",
    async () => {
      const samples = [];
      const t0 = Date.now();
      const result = await simulateWithTevm({
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
        balanceOverrides: [{ address: fixture.from, balance: "10" }],
        onProgress: (pct) => samples.push({ pct, t: Date.now() - t0 }),
      });

      // The fixture tx must succeed; if it reverts, the fixture's quote
      // deadlines have likely expired — regenerate the fixture.
      expect(result.success, `fixture expired? error: ${result.error}`).toBe(
        true,
      );

      // The bar must actually move: several updates, real values, rising.
      expect(samples.length).toBeGreaterThanOrEqual(5);
      expect(Math.max(...samples.map((s) => s.pct))).toBeGreaterThanOrEqual(50);
      for (let i = 1; i < samples.length; i++) {
        expect(samples[i].pct).toBeGreaterThanOrEqual(samples[i - 1].pct);
      }
    },
    60_000,
  );
});
