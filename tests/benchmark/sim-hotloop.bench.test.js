// Step-hook hot-loop benchmark: measures the per-opcode cost of the call
// tracer at realistic opcode counts.
//
// The recorded LiFi/Across fixture only executes ~11k opcodes, so it cannot
// distinguish a per-opcode cost that is amortised over millions of opcodes —
// which is exactly the regime that matters. A heavy swap on mainnet runs
// hundreds of thousands to millions of opcodes, and in the browser that work
// happens on the main thread competing with rendering.
//
// This runs a hand-assembled loop contract against a local JSON-RPC stub so the
// opcode count is exact and the measurement is deterministic and offline. The
// loop body is 10 opcodes per iteration:
//
//   PUSH1 0x00 · PUSH1 <iterations> · PUSH1 0x00 · MSTORE   seed memory[0]
// loop: JUMPDEST · PUSH1 0x00 · MLOAD · PUSH1 0x01 · ADD ·
//       DUP1 · PUSH1 0x00 · MSTORE · PUSH1 <loop> · JUMPI
//   STOP
//
// The comparison that matters is peak memory and wall time, since the tracer
// records every program counter it sees.
import { describe, it, expect } from "vitest";
import { writeFile } from "node:fs/promises";
import { simulateWithTevm } from "../../app/utils/tevmSimulator.js";

const LOOP_ITERATIONS = Number(process.env.SIM_BENCH_ITERS || 200_000);
const RUNS = Math.max(1, Number(process.env.SIM_BENCH_RUNS || 3));

const TARGET = "0x1111111111111111111111111111111111111111";
const SENDER = "0x2222222222222222222222222222222222222222";
const GAS_LIMIT = 30_000_000;

// Counter stays on the stack, so there is no MSTORE/MLOAD ordering to get
// wrong. SUB computes top-minus-next, hence the SWAP1 to put the counter on
// top with 1 beneath it:
//
//   63 <iter:4>  5 bytes   [n]
// loop: 5b                  JUMPDEST at 0x05
//        6001               PUSH1 0x01     [n, 1]
//        90                 SWAP1          [1, n]
//        03                 SUB            [n - 1]
//        80                 DUP1           [n-1, n-1]
//        6005               PUSH1 0x05
//        57                 JUMPI  → loop while n-1 != 0
//   00                       STOP
//
// 8 opcodes and 26 gas per iteration.
function burnCode(iterations) {
  if (iterations < 1 || iterations > 0xffffffff) {
    throw new Error("iterations must be 1..4294967295");
  }
  const iter = iterations.toString(16).padStart(8, "0");
  return (
    "0x" +
    "63" +
    iter + // PUSH4 iterations
    "5b" + // JUMPDEST  (0x05) — loop head
    "6001" + // PUSH1 0x01
    "90" + // SWAP1
    "03" + // SUB
    "80" + // DUP1
    "6005" + // PUSH1 0x05
    "57" + // JUMPI
    "00" // STOP
  );
}

function createStubRpc(code) {
  const blockNumber = "0x10";
  const block = {
    number: blockNumber,
    hash: "0x" + "ab".repeat(32),
    parentHash: "0x" + "cd".repeat(32),
    nonce: "0x0000000000000000",
    sha3Uncles:
      "0x1dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347",
    logsBloom: "0x" + "00".repeat(256),
    transactionsRoot: "0x" + "00".repeat(32),
    stateRoot: "0x" + "00".repeat(32),
    receiptsRoot: "0x" + "00".repeat(32),
    miner: "0x" + "00".repeat(20),
    difficulty: "0x0",
    totalDifficulty: "0x0",
    extraData: "0x",
    size: "0x0",
    gasLimit: "0x" + (GAS_LIMIT + 1_000_000).toString(16),
    gasUsed: "0x0",
    timestamp: "0x6611a4c8",
    transactions: [],
    uncles: [],
    baseFeePerGas: "0x7",
    mixHash: "0x" + "00".repeat(32),
  };
  const respond = (r) => {
    switch (r.method) {
      case "eth_chainId":
        return "0x1";
      case "eth_blockNumber":
        return blockNumber;
      case "eth_getBlockByNumber":
      case "eth_getBlockByHash":
        return block;
      case "eth_getCode":
        return r.params[0].toLowerCase() === TARGET ? code : "0x";
      case "eth_getBalance":
        return "0xde0b6b3a7640000";
      case "eth_getTransactionCount":
        return "0x0";
      case "eth_getStorageAt":
        return "0x" + "00".repeat(32);
      case "eth_estimateGas":
        return "0x" + GAS_LIMIT.toString(16);
      case "eth_createAccessList":
        return { accessList: [], gasUsed: "0x" + GAS_LIMIT.toString(16) };
      default:
        return null;
    }
  };
  return async (req) => {
    if (req.method === "eth_createAccessList") return respond(req);
    if (process.env.SIM_BENCH_TRACE) {
      console.log(
        "RPC",
        req.method,
        JSON.stringify(req.params ?? []).slice(0, 70),
      );
    }
    return respond(req);
  };
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

describe("step-hook hot loop benchmark", () => {
  it(
    `runs ${LOOP_ITERATIONS.toLocaleString()} loop iterations (${(
      LOOP_ITERATIONS * 10
    ).toLocaleString()} opcodes) through the call tracer`,
    async () => {
      const code = burnCode(LOOP_ITERATIONS);
      const run = async () => {
        const stub = createStubRpc(code);
        const before = process.memoryUsage().rss;
        // Peak RSS growth rather than heapUsed: the call tracer's cost here is
        // one retained array per frame, and peak RSS is not at the mercy of
        // when the collector happens to run.
        let peak = before;
        const poll = setInterval(() => {
          const rss = process.memoryUsage().rss;
          if (rss > peak) peak = rss;
        }, 5);
        const t0 = performance.now();
        const result = await simulateWithTevm({
          chain: "ethereum",
          rpcUrl: "http://stub.invalid",
          blockNumber: "0x10",
          address: TARGET,
          fromAddress: SENDER,
          callData: "0x",
          abi: [],
          rpcBatchSize: 1,
          balanceOverrides: [{ address: SENDER, balance: "100" }],
          stepHookMode: "sync",
          // Prefetch is off: this benchmark is about the execution hot loop,
          // and the stub serves every state read locally either way.
          // Prefetch off: this benchmark isolates the execution hot loop, and the
          // stub answers every state read locally either way.
          prefetch: false,
          rpcDecorator: stub,
        });
        const wallMs = performance.now() - t0;
        clearInterval(poll);
        return {
          wallMs,
          execMs: result.metrics.phases.executionMs,
          peakRssMb: (peak - before) / 1024 / 1024,
          success: result.success,
          gasUsed: result.gasUsed,
          uniquePcs: (result.callTrace?.pcs || []).length,
        };
      };

      const warm = await run();
      expect(warm.success, `loop sim failed: ${warm.error || ""}`).toBe(true);

      const runs = [];
      for (let i = 0; i < RUNS; i++) runs.push(await run());

      const line =
        `iters=${LOOP_ITERATIONS} opcodes≈${LOOP_ITERATIONS * 10} ` +
        `wallMed=${Math.round(median(runs.map((r) => r.wallMs)))}ms ` +
        `execMed=${Math.round(median(runs.map((r) => r.execMs)))}ms ` +
        `peakRSSΔMed=${median(runs.map((r) => r.peakRssMb)).toFixed(1)}MB ` +
        `gas=${warm.gasUsed} uniquePcs=${warm.uniquePcs}`;
      console.log("\nHOTLOOP " + line);
      if (process.env.SIM_BENCH_OUT) {
        await writeFile(process.env.SIM_BENCH_OUT, line + "\n");
      }
    },
    30 * 60_000,
  );
});
