// @vitest-environment node
//
// Two configuration paths the RPC round-trip tests above do not reach.
//
// 1. Batching. `/api/simulate-tx` defaults to rpcBatchSize=20 while the browser
//    defaults to 1, and the perf change makes prefetch share the fork
//    transport — so prefetch requests now flow through the same batcher as the
//    EVM's lazy loads. That seam is only exercised over real HTTP, where
//    viem actually sends a JSON-RPC array.
//
// 2. Write-mode sessions. A session that commits state must still see its own
//    commits on the next call, rather than the fork's original values. The fork
//    here always reports slot 0 as zero, so a returned 42 can only have come
//    from committed state.
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
const VALUE_42 = "0x" + "0".repeat(62) + "2a";
// SLOAD(0) -> MSTORE(0) -> RETURN(0, 32)
const STORAGE_READER_CODE = "0x60005460005260206000f3";
const BLOCK_NUMBER = "0x10";
const CONTRACT = "0x1111111111111111111111111111111111111111";
const CALLER = "0x2222222222222222222222222222222222222222";
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

function createFork({ accessList = null } = {}) {
  const logical = [];
  const storageReads = [];
  let httpRequests = 0;
  let maxBatchSize = 0;
  const respond = (r) => {
    logical.push(`${r.method}|${JSON.stringify(r.params ?? [])}`);
    switch (r.method) {
      case "eth_chainId":
        return "0x1";
      case "eth_blockNumber":
        return BLOCK_NUMBER;
      case "eth_gasPrice":
        return "0x1";
      case "eth_maxPriorityFeePerGas":
        return "0x0";
      case "eth_feeHistory":
        return {
          oldestBlock: BLOCK_NUMBER,
          baseFeePerGas: ["0x7"],
          gasUsedRatio: [],
        };
      case "eth_getBalance":
        return "0xde0b6b3a7640000";
      case "eth_getTransactionCount":
        return "0x0";
      case "eth_getCode":
        return r.params[0].toLowerCase() === CONTRACT
          ? STORAGE_READER_CODE
          : "0x";
      case "eth_getStorageAt":
        storageReads.push(r.params);
        return ZERO32;
      case "eth_estimateGas":
        return "0x7530";
      case "eth_createAccessList":
        return accessList;
      case "eth_getBlockByNumber":
      case "eth_getBlockByHash":
        return BLOCK;
      default:
        return null;
    }
  };
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      httpRequests += 1;
      const parsed = JSON.parse(body);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      maxBatchSize = Math.max(maxBatchSize, arr.length);
      const out = arr.map((r) => ({
        jsonrpc: "2.0",
        id: r.id,
        result: respond(r),
      }));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(Array.isArray(parsed) ? out : out[0]));
    });
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        logical,
        storageReads,
        httpRequests: () => httpRequests,
        maxBatchSize: () => maxBatchSize,
        close: () => new Promise((r) => server.close(r)),
      });
    }),
  );
}

const ACCESS_LIST = {
  accessList: [{ address: CONTRACT, storageKeys: [SLOT0, SLOT1] }],
  gasUsed: "0x5208",
};

describe("batched fork reads", () => {
  it("gives the same result at batchSize 1 and 20, and batches at 20", async () => {
    const unbatched = await createFork({ accessList: ACCESS_LIST });
    const batched = await createFork({ accessList: ACCESS_LIST });
    try {
      const common = {
        chain: "ethereum",
        address: CONTRACT,
        fromAddress: CALLER,
        callData: "0x",
        abi: [],
        balanceOverrides: [{ address: CALLER, balance: "10" }],
      };
      const a = await simulateWithTevm({
        ...common,
        rpcUrl: unbatched.url,
        blockNumber: BLOCK_NUMBER,
        rpcBatchSize: 1,
      });
      const b = await simulateWithTevm({
        ...common,
        rpcUrl: batched.url,
        blockNumber: BLOCK_NUMBER,
        // The server route's default.
        rpcBatchSize: 20,
      });

      expect(a.success, a.error).toBe(true);
      expect(b.success, b.error).toBe(true);
      // Batching must not change the outcome.
      expect(b.gasUsed).toBe(a.gasUsed);
      expect(b.rawData).toBe(a.rawData);
      expect((b.logs || []).length).toBe((a.logs || []).length);

      // Batching collapses HTTP round-trips without changing the logical work,
      // and the fork-read memo still holds under batching.
      expect(batched.httpRequests()).toBeLessThan(unbatched.httpRequests());
      expect(batched.maxBatchSize()).toBeGreaterThan(1);
      expect(batched.logical.length).toBe(unbatched.logical.length);
      for (const fork of [unbatched, batched]) {
        expect(fork.logical.length).toBe(new Set(fork.logical).size);
      }
    } finally {
      await unbatched.close();
      await batched.close();
    }
  });
});

describe("write-mode session state", () => {
  it("still sees a committed storage override on the next call", async () => {
    const fork = await createFork();
    try {
      const { client, blockNumber } = await createTevmClient(
        "ethereum",
        fork.url,
        BLOCK_NUMBER,
        null,
        1,
      );
      const base = {
        chain: "ethereum",
        address: CONTRACT,
        fromAddress: CALLER,
        callData: "0x",
        abi: [],
        balanceOverrides: [{ address: CALLER, balance: "10" }],
        persistState: true,
      };

      const first = await simulateWithClient(client, blockNumber, {
        ...base,
        storageOverrides: [{ address: CONTRACT, slot: SLOT0, value: VALUE_42 }],
      });
      // No override this time. The fork reports slot 0 as zero, so anything but
      // zero can only have come from the state committed by the first call.
      const second = await simulateWithClient(client, blockNumber, base);

      expect(first.rawData).toBe(VALUE_42);
      expect(second.rawData).toBe(VALUE_42);
    } finally {
      await fork.close();
    }
  });
});
