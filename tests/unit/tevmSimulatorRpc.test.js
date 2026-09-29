// @vitest-environment node
//
// Regression tests for the fork-state request path.
//
// A cold simulation's wall time is dominated by JSON-RPC round-trips, not by
// EVM execution, so these tests assert the *number and identity* of RPC calls
// rather than timing. Each one pins a behaviour that used to issue avoidable
// requests:
//
//   1. tevm resolves an account through two paths — getProof (expanded by the
//      proof-free transport into eth_getBalance + eth_getCode) and
//      getContractCode — so every account used to cost two identical
//      eth_getCode calls. Fork reads are now memoized per simulation.
//   2. eth_estimateGas made the node execute the whole transaction a second
//      time. It was requested unconditionally, because the "do we need a
//      fallback denominator?" check ran before eth_createAccessList had a
//      chance to supply one.
//   3. The target contract's code and balance were fetched by both prefetch
//      tiers — the access list always contains the target.
//   4. metrics.rpc only counted prefetch traffic, so the panel under-reported a
//      63-request simulation as 4.
import { describe, it, expect } from "vitest";
import { createServer } from "node:http";
import {
  createTevmClient,
  simulateWithClient,
  simulateWithTevm,
} from "../../app/utils/tevmSimulator.js";

const ZERO32 = "0x" + "0".repeat(64);
const SLOT0 = ZERO32;
const SLOT1 = "0x" + "0".repeat(63) + "1";
// SLOAD(0) → MSTORE(0) → RETURN(0, 32): reads one storage slot and returns it.
const STORAGE_READER_CODE = "0x60005460005260206000f3";

const BLOCK_NUMBER = "0x10";
const BLOCK = {
  number: BLOCK_NUMBER,
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
  gasLimit: "0x1c9c380",
  gasUsed: "0x0",
  timestamp: "0x6611a4c8",
  transactions: [],
  uncles: [],
  baseFeePerGas: "0x7",
  mixHash: "0x" + "00".repeat(32),
};

// Fork stub that records every logical request as `method|params`, so tests can
// assert both the multiset of methods and that no identical read repeats.
function createCountingForkRpc({
  contracts = {},
  accessList = null,
  accessListGasUsed = "0x5208",
} = {}) {
  const calls = [];
  const count = (method) => calls.filter((c) => c.method === method).length;
  const respond = (r) => {
    calls.push({ method: r.method, params: r.params ?? [] });
    switch (r.method) {
      case "eth_chainId":
        return { jsonrpc: "2.0", id: r.id, result: "0x1" };
      case "eth_blockNumber":
        return { jsonrpc: "2.0", id: r.id, result: BLOCK_NUMBER };
      case "eth_gasPrice":
        return { jsonrpc: "2.0", id: r.id, result: "0x1" };
      case "eth_maxPriorityFeePerGas":
        return { jsonrpc: "2.0", id: r.id, result: "0x0" };
      case "eth_feeHistory":
        return {
          jsonrpc: "2.0",
          id: r.id,
          result: {
            oldestBlock: BLOCK_NUMBER,
            baseFeePerGas: ["0x7"],
            gasUsedRatio: [],
          },
        };
      case "eth_getBalance":
        return { jsonrpc: "2.0", id: r.id, result: "0xde0b6b3a7640000" };
      case "eth_getTransactionCount":
        return { jsonrpc: "2.0", id: r.id, result: "0x0" };
      case "eth_getCode": {
        const code = contracts[r.params[0].toLowerCase()];
        return {
          jsonrpc: "2.0",
          id: r.id,
          result: code ? code : "0x60806040523480156100105760006000fd5b50",
        };
      }
      case "eth_getStorageAt":
        return { jsonrpc: "2.0", id: r.id, result: ZERO32 };
      case "eth_createAccessList": {
        if (accessList === null) {
          return {
            jsonrpc: "2.0",
            id: r.id,
            error: { code: -32601, message: "method not found" },
          };
        }
        return {
          jsonrpc: "2.0",
          id: r.id,
          result: { accessList, gasUsed: accessListGasUsed },
        };
      }
      case "eth_estimateGas":
        return { jsonrpc: "2.0", id: r.id, result: "0x7530" };
      case "eth_getBlockByNumber":
      case "eth_getBlockByHash":
        return { jsonrpc: "2.0", id: r.id, result: BLOCK };
      default:
        return { jsonrpc: "2.0", id: r.id, result: null };
    }
  };

  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const parsed = JSON.parse(body);
      const payload = Array.isArray(parsed)
        ? parsed.map(respond)
        : respond(parsed);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(payload));
    });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        calls,
        count,
        // Identical logical requests, e.g. the same method+params twice.
        duplicateKeys() {
          const seen = new Set();
          const dupes = [];
          for (const c of calls) {
            const key = `${c.method}|${JSON.stringify(c.params)}`;
            if (seen.has(key)) dupes.push(key);
            else seen.add(key);
          }
          return dupes;
        },
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

const CALLER = "0x3333333333333333333333333333333333333333";
const CALLER2 = "0x4444444444444444444444444444444444444444";

function simulate(url, over = {}) {
  return simulateWithTevm({
    chain: "ethereum",
    rpcUrl: url,
    blockNumber: BLOCK_NUMBER,
    address: CALLER,
    fromAddress: CALLER2,
    callData: "0x",
    abi: [],
    rpcBatchSize: 1,
    balanceOverrides: [{ address: CALLER2, balance: "10" }],
    ...over,
  });
}

describe("fork state reads are requested once per simulation", () => {
  it("fetches each account's code exactly once", async () => {
    const fork = await createCountingForkRpc({
      contracts: { [CALLER.toLowerCase()]: STORAGE_READER_CODE },
    });
    try {
      const result = await simulate(fork.url);
      expect(result.success, result.error).toBe(true);

      // Before the fix tevm's getProof expansion and getContractCode each asked
      // for eth_getCode, doubling the code round-trips for every account.
      const codeCalls = fork.calls.filter((c) => c.method === "eth_getCode");
      const distinct = new Set(
        codeCalls.map((c) => `${c.params[0].toLowerCase()}|${c.params[1]}`),
      );
      expect(codeCalls.length).toBe(distinct.size);
      expect(codeCalls.length).toBeGreaterThan(0);
    } finally {
      await fork.close();
    }
  });

  it("never repeats an identical fork read within one simulation", async () => {
    const fork = await createCountingForkRpc({
      contracts: { [CALLER.toLowerCase()]: STORAGE_READER_CODE },
      accessList: [
        { address: CALLER, storageKeys: [SLOT0, SLOT1] },
        { address: CALLER2, storageKeys: [SLOT0] },
      ],
    });
    try {
      await simulate(fork.url);
      expect(fork.duplicateKeys()).toEqual([]);
    } finally {
      await fork.close();
    }
  });

  it("skips eth_estimateGas when eth_createAccessList already reports gas", async () => {
    const fork = await createCountingForkRpc({
      contracts: { [CALLER.toLowerCase()]: STORAGE_READER_CODE },
      accessList: [{ address: CALLER, storageKeys: [SLOT0] }],
      accessListGasUsed: "0x1234",
    });
    try {
      const result = await simulate(fork.url);
      expect(result.success, result.error).toBe(true);
      expect(fork.count("eth_createAccessList")).toBe(1);
      // eth_estimateGas makes the node execute the entire transaction again.
      // With a denominator already in hand it is pure duplicated work.
      expect(fork.count("eth_estimateGas")).toBe(0);
    } finally {
      await fork.close();
    }
  });

  it("still falls back to eth_estimateGas when createAccessList is unsupported", async () => {
    const fork = await createCountingForkRpc({
      contracts: { [CALLER.toLowerCase()]: STORAGE_READER_CODE },
      accessList: null,
    });
    try {
      const result = await simulate(fork.url);
      expect(result.success, result.error).toBe(true);
      expect(fork.count("eth_createAccessList")).toBe(1);
      expect(fork.count("eth_estimateGas")).toBe(1);
    } finally {
      await fork.close();
    }
  });

  it("fetches the target's code and balance once even though both prefetch tiers need it", async () => {
    const fork = await createCountingForkRpc({
      contracts: { [CALLER.toLowerCase()]: STORAGE_READER_CODE },
      accessList: [{ address: CALLER, storageKeys: [SLOT0] }],
    });
    try {
      await simulate(fork.url);
      for (const method of ["eth_getCode", "eth_getBalance"]) {
        const forTarget = fork.calls.filter(
          (c) =>
            c.method === method &&
            c.params[0]?.toLowerCase() === CALLER.toLowerCase(),
        );
        expect(forTarget.length, `${method} for target`).toBe(1);
      }
    } finally {
      await fork.close();
    }
  });

  it("counts fork reads in metrics, not just prefetch traffic", async () => {
    const fork = await createCountingForkRpc({
      contracts: { [CALLER.toLowerCase()]: STORAGE_READER_CODE },
      accessList: [{ address: CALLER, storageKeys: [SLOT0, SLOT1] }],
    });
    try {
      const result = await simulate(fork.url, { includeMetrics: true });
      const logical = result.metrics.rpc.totalLogicalCalls;
      const byMethod = result.metrics.rpc.byMethod;
      // The metrics collector used to be handed to the prefetch transport only,
      // so the EVM's own state reads were invisible and a 60+ request
      // simulation reported 4.
      expect(logical).toBe(fork.calls.length);
      expect(byMethod.eth_getCode?.count).toBe(fork.count("eth_getCode"));
      expect(byMethod.eth_getStorageAt?.count).toBe(
        fork.count("eth_getStorageAt"),
      );
    } finally {
      await fork.close();
    }
  });
});

describe("fork read memoisation is scoped to a single simulation", () => {
  it("resets the memo between calls on a shared session client", async () => {
    const fork = await createCountingForkRpc({
      contracts: { [CALLER.toLowerCase()]: STORAGE_READER_CODE },
      accessList: [{ address: CALLER, storageKeys: [SLOT0] }],
    });
    try {
      const { client, blockNumber } = await createTevmClient(
        "ethereum",
        fork.url,
        BLOCK_NUMBER,
        null,
        1,
      );
      // The reset hook is what keeps one call's memo from answering the next.
      expect(typeof client.resetForkRpcMemo).toBe("function");

      const params = {
        chain: "ethereum",
        address: CALLER,
        fromAddress: CALLER2,
        callData: "0x",
        abi: [],
        balanceOverrides: [{ address: CALLER2, balance: "10" }],
      };
      const a = await simulateWithClient(client, blockNumber, params);
      const b = await simulateWithClient(client, blockNumber, params);
      expect(a.success, a.error).toBe(true);
      expect(b.success, b.error).toBe(true);
      // Resetting the memo must not disturb the client's committed state or the
      // decoded result.
      expect(b.gasUsed).toBe(a.gasUsed);
      expect((b.logs || []).length).toBe((a.logs || []).length);
    } finally {
      await fork.close();
    }
  });
});
