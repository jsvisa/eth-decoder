import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { simulateWithTevm } from "../../app/utils/tevmSimulator.js";

// Regression test for the sync step hook's cancel path.
//
// The hook throws synchronously when the abort signal fires; that throw
// rejects EthereumJS's per-step dispatch promise and unwinds the EVM run, so
// the simulation promise settles quickly with success=false. (The legacy
// async hook threw BEFORE calling next(), leaving the dispatch promise — and
// therefore the whole simulation — pending forever, which would hang this
// test until the timeout.)
//
// Uses the pinned heavy fixture (a ~4.5s swap) so "still running at abort
// time" is guaranteed. Run with:
//   SIM_BENCH_RPC_URL=<worldchain rpc> npx vitest run --project benchmark

const RPC = process.env.SIM_BENCH_RPC_URL;

const fixture = JSON.parse(
  await readFile(
    new URL("./__fixtures__/worldchain-swap.json", import.meta.url),
    "utf8",
  ),
);

describe("simulation cancel via abort signal", () => {
  it.skipIf(!RPC)(
    "settles quickly when aborted mid-run instead of hanging forever",
    async () => {
      const controller = new AbortController();
      // The fixture tx runs ~4.5s in the EVM; abort while it is running.
      const cancelTimer = setTimeout(() => controller.abort(), 1000);

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
        abortSignal: controller.signal,
      });
      clearTimeout(cancelTimer);

      const settledMs = Date.now() - t0;
      // Without the fix this promise never settles. A full (uncancelled) run
      // takes ~5.5s and succeeds; settling under 4s with success=false
      // proves the abort unwound the EVM.
      expect(settledMs).toBeLessThan(4_000);
      expect(result.success).toBe(false);
    },
    30_000,
  );
});
