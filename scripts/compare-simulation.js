#!/usr/bin/env node
/**
 * compare-simulation.js — verify /api/simulate-tx results against a real node.
 *
 * Ground truth per transaction:
 *   - debug_traceTransaction (callTracer, withLog) — call tree + per-frame logs
 *   - eth_getTransactionReceipt                    — status + flattened logs
 *
 * Usage:
 *   node scripts/compare-simulation.js --tx 0xHASH [options]
 *   node scripts/compare-simulation.js --start-block 123 [--end-block 125] [options]
 *   node scripts/compare-simulation.js                # defaults to latest block
 *
 * Options:
 *   --chain <id>          chain id used for the simulation POST (default: 1)
 *   --rpc-url <url>       trace-capable RPC (default: http://172.26.172.16:8545,
 *                         env COMPARE_RPC_URL). Also used as the simulation fork RPC.
 *   --api <url>           decoder app base URL (default: http://localhost:3000)
 *   --concurrency <n>     parallel ground-truth fetches (default: 1)
 *   --max-txs <n>         cap txs compared per block (useful for big blocks)
 *   --per-tx              block mode: independent per-tx sims instead of session replay
 *   --json                write full normalized trees + diffs to a temp file
 *   -v, --verbose         print all diffs and normalized trees on failure
 *
 * Requires the dev server to be running (npm run dev). If the sim POST is
 * rejected because the RPC URL is a private address, restart the server with
 * ALLOW_PRIVATE_RPC=true.
 *
 * Exit code: 0 if every compared tx passed, 1 on any FAIL/ERROR.
 *
 * Notes on known divergences (intentional, not counted as diffs):
 *   - The simulator prunes STATICCALL frames from its tree (app/utils/tevmSimulator.js
 *     pruneStaticCalls), so STATICCALLs are filtered from the geth trace too.
 *   - gasUsed differs (execution gas vs tx gas incl. intrinsic) — reported, not compared.
 *   - Error message strings differ across clients (e.g. "execution reverted" vs
 *     "revert") — only error presence is compared.
 *   - Block mode replays each block with the session API: chunks of ≤20
 *     sequential calls sharing forked state, so txs see the state changes of
 *     earlier txs in the same chunk (like real execution). Chunks restart from
 *     the parent block, so state does not carry across chunk boundaries
 *     (failures at a boundary are annotated). Use --per-tx for the old
 *     independent mode.
 *   - Single txs (--tx, --per-tx) simulate with block.timestamp pinned to the
 *     tx's own block (app-side warp fix). Session-replayed txs beyond the
 *     first of each chunk are mined by tevm with a wall-clock timestamp
 *     (unfixable in tevm 1.0.0-next.148), which can false-FAIL
 *     deadline-guarded txs (annotated).
 *   - MEV/searcher bots that branch on block context (coinbase, pool state,
 *     profitability) will legitimately diverge when re-simulated.
 */

const DEFAULT_RPC_URL =
  process.env.COMPARE_RPC_URL || "http://172.26.172.16:8545";
const DEFAULT_API = "http://localhost:3000";

// ── args ────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    chain: 1,
    tx: null,
    startBlock: null,
    endBlock: null,
    rpcUrl: DEFAULT_RPC_URL,
    api: DEFAULT_API,
    concurrency: 1,
    maxTxs: null,
    perTx: false,
    json: false,
    verbose: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--tx") args.tx = argv[++i];
    else if (a === "--chain") args.chain = Number(argv[++i]);
    else if (a === "--start-block") args.startBlock = Number(argv[++i]);
    else if (a === "--end-block") args.endBlock = Number(argv[++i]);
    else if (a === "--rpc-url") args.rpcUrl = argv[++i];
    else if (a === "--api") args.api = argv[++i];
    else if (a === "--concurrency") args.concurrency = Number(argv[++i]);
    else if (a === "--max-txs") args.maxTxs = Number(argv[++i]);
    else if (a === "--per-tx") args.perTx = true;
    else if (a === "--json") args.json = true;
    else if (a === "-v" || a === "--verbose") args.verbose = true;
    else if (a === "-h" || a === "--help") args.help = true;
    else {
      console.error(`Unknown argument: ${a}`);
      process.exit(1);
    }
  }
  return args;
}

function printHelp() {
  console.log(`Verify simulation results against debug_traceTransaction.

Usage:
  node scripts/compare-simulation.js --tx 0xHASH [options]
  node scripts/compare-simulation.js --start-block N [--end-block M] [options]
  node scripts/compare-simulation.js                 # latest block

Options:
  --chain <id>        chain id for the simulation POST (default: 1)
  --rpc-url <url>     trace-capable RPC (default: ${DEFAULT_RPC_URL})
  --api <url>         decoder app base URL (default: ${DEFAULT_API})
  --concurrency <n>   parallel comparisons (default: 1)
  --max-txs <n>       cap the number of txs compared (useful for big blocks)
  --per-tx            block mode: simulate each tx independently instead of
                      replaying the block with the session API (default)
  --json              dump normalized trees + diffs to a temp file
  -v, --verbose       print all diffs and normalized trees`);
}

// ── json-rpc ────────────────────────────────────────────────────────────────

let rpcId = 0;

async function rpc(url, method, params = []) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  if (!res.ok) throw new Error(`RPC ${method} HTTP ${res.status}`);
  const body = await res.json();
  if (body.error) {
    const err = new Error(
      `RPC ${method}: ${body.error.message || JSON.stringify(body.error)}`,
    );
    err.code = body.error.code;
    throw err;
  }
  return body.result;
}

// ── normalization ───────────────────────────────────────────────────────────

const lc = (v) => (v == null ? null : String(v).toLowerCase());
const toBig = (v) => BigInt(v == null || v === "0x" ? 0 : v);

function normLog(log) {
  return {
    address: lc(log.address),
    topics: (log.topics || []).map(lc),
    data: lc(log.data || "0x"),
  };
}

/** Normalize a geth callTracer node to the sim tree shape. */
function normGethNode(node) {
  return {
    type: node.type,
    from: lc(node.from),
    to: lc(node.to),
    value: toBig(node.value),
    input: lc(node.input || "0x"),
    output: lc(node.output || "0x"),
    error: node.error || null,
    logs: (node.logs || []).map(normLog),
    calls: (node.calls || [])
      .filter((c) => c.type !== "STATICCALL") // sim prunes STATICCALL frames
      .map(normGethNode),
  };
}

const SIM_NODE_STRIP = new Set([
  "toName",
  "functionName",
  "decodedInputs",
  "decodedOutputs",
  "errorReason",
  "pcs",
]);

function normSimNode(node) {
  const out = { logs: [], calls: [] };
  for (const [k, v] of Object.entries(node)) {
    if (SIM_NODE_STRIP.has(k)) continue;
    if (k === "logs") out.logs = (v || []).map(normLog);
    else if (k === "calls") out.calls = (v || []).map(normSimNode);
    else if (k === "value" || k === "gas" || k === "gasUsed") out[k] = toBig(v);
    else if (k === "from" || k === "to") out[k] = lc(v);
    else out[k] = v == null ? null : v;
  }
  return out;
}

// ── comparison ──────────────────────────────────────────────────────────────

function fmt(v) {
  let s = typeof v === "bigint" ? v.toString() : String(v);
  if (s.length > 66) s = `${s.slice(0, 66)}…(len ${s.length})`;
  return s;
}

function diffLogs(simLogs, chainLogs, path, diffs) {
  if (simLogs.length !== chainLogs.length) {
    diffs.push({
      path: `${path}.length`,
      sim: simLogs.length,
      chain: chainLogs.length,
    });
  }
  const n = Math.min(simLogs.length, chainLogs.length);
  for (let i = 0; i < n; i++) {
    for (const key of ["address", "topics", "data"]) {
      const a = JSON.stringify(simLogs[i][key]);
      const b = JSON.stringify(chainLogs[i][key]);
      if (a !== b)
        diffs.push({ path: `${path}[${i}].${key}`, sim: a, chain: b });
    }
  }
}

function diffNodes(sim, chain, path, diffs) {
  for (const key of ["type", "from", "to", "input", "output"]) {
    if (sim[key] !== chain[key]) {
      diffs.push({ path: `${path}.${key}`, sim: sim[key], chain: chain[key] });
    }
  }
  if (sim.value !== chain.value) {
    diffs.push({
      path: `${path}.value`,
      sim: fmt(sim.value),
      chain: fmt(chain.value),
    });
  }
  if (!!sim.error !== !!chain.error) {
    diffs.push({ path: `${path}.error`, sim: sim.error, chain: chain.error });
  }
  diffLogs(sim.logs, chain.logs, `${path}.logs`, diffs);
  if (sim.calls.length !== chain.calls.length) {
    diffs.push({
      path: `${path}.calls.length`,
      sim: sim.calls.length,
      chain: chain.calls.length,
    });
  }
  const n = Math.min(sim.calls.length, chain.calls.length);
  for (let i = 0; i < n; i++) {
    diffNodes(sim.calls[i], chain.calls[i], `${path}.calls[${i}]`, diffs);
  }
}

// ── ground truth + simulation ───────────────────────────────────────────────

const MAX_SESSION_CALLS = 20; // must match the route's session limit

async function postSimulate(api, body) {
  let res;
  try {
    res = await fetch(`${api}/api/simulate-tx`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(600_000),
    });
  } catch (err) {
    throw new Error(
      `simulation request failed (${err.message}) — is the dev server running at ${api}? (npm run dev)`,
    );
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    let msg = `simulate HTTP ${res.status}: ${data.error || "unknown error"}`;
    if (/private|internal|ssrf|not allowed/i.test(msg)) {
      msg +=
        " — restart the dev server with ALLOW_PRIVATE_RPC=true to use this RPC";
    }
    throw new Error(msg);
  }
  return data;
}

/** Single-tx simulation at the parent block, timestamp warped to the tx's own block. */
async function simulateSingleTx(api, chainId, rpcUrl, tx, blockTs) {
  return postSimulate(api, {
    chainId,
    to: tx.to,
    from: tx.from,
    data: tx.input || "0x",
    value: tx.value || "0x0",
    gas: tx.gas,
    blockNumber: String(BigInt(tx.blockNumber) - 1n), // parent-block state
    price: false,
    rpcUrl,
    ...(blockTs
      ? { cheatcodes: { warp: { timestamp: String(BigInt(blockTs)) } } }
      : {}),
  });
}

/** Replay a ≤20-tx slice of a block with the session API (shared forked state). */
async function simulateSessionChunk(api, chainId, rpcUrl, blockNumber, txs) {
  return postSimulate(api, {
    chainId,
    blockNumber: String(BigInt(blockNumber) - 1n), // parent-block state
    price: false,
    rpcUrl,
    calls: txs.map((tx) => ({
      to: tx.to || null, // null => contract creation (still replayed for state)
      from: tx.from,
      data: tx.input || "0x",
      value: tx.value || "0x0",
      gas: tx.gas,
    })),
  });
}

/** Fetch receipt + callTracer trace for one tx (ground truth). */
async function fetchGroundTruth(rpcUrl, tx) {
  if (!tx.to) return { kind: "skip", note: "contract creation" };
  const receipt = await rpc(rpcUrl, "eth_getTransactionReceipt", [tx.hash]);
  if (!receipt) return { kind: "error", note: "no receipt on RPC" };
  let gethTrace;
  try {
    gethTrace = await rpc(rpcUrl, "debug_traceTransaction", [
      tx.hash,
      { tracer: "callTracer", tracerConfig: { withLog: true } },
    ]);
  } catch (err) {
    if (err.code === -32601) {
      return {
        kind: "error",
        note: "RPC has no debug_traceTransaction — use --rpc-url with a trace-capable node",
      };
    }
    return { kind: "error", note: err.message };
  }
  return { kind: "ok", receipt, gethTrace };
}

/**
 * Compare one simulation result (single or session call) against ground truth.
 * ctx: { txIndexInBlock, simMode: "session"|"per-tx", isChunkStart }
 * Returns {status: "PASS"|"FAIL", diffs, gasDelta, note, simTrace, chainTrace}
 */
function diffAgainstChain(sim, gt, ctx) {
  const diffs = [];
  const simTrace = normSimNode(sim.callTrace);
  const chainTrace = normGethNode(gt.gethTrace);

  // outcome: receipt status vs sim success
  const chainOk = gt.receipt.status === "0x1";
  if (Boolean(sim.success) !== chainOk) {
    diffs.push({
      path: "outcome",
      sim: sim.success ? "success" : `reverted (${sim.error})`,
      chain: chainOk ? "success" : "reverted",
    });
  }

  diffNodes(simTrace, chainTrace, "root", diffs);

  // receipt logs vs flattened sim logs (execution order)
  const receiptLogs = (gt.receipt.logs || []).map(normLog);
  const simLogs = (sim.logs || []).map(normLog);
  diffLogs(simLogs, receiptLogs, "receipt.logs", diffs);

  const gasDelta = Number(sim.gasUsed) - Number(BigInt(gt.receipt.gasUsed));

  let note = null;
  if (diffs.length) {
    if (/deadline|expired/i.test(sim.error || "") && chainOk) {
      note =
        ctx.simMode === "session"
          ? "sim reverted on a time check: tevm mines session txs into wall-clock-timestamped blocks, so deadline-guarded txs may false-FAIL (known tevm limitation)"
          : "sim reverted on a time check: block.timestamp was not pinned to the block — the simulator's warp fix may have regressed";
    } else if (ctx.simMode === "session") {
      if (ctx.isChunkStart && ctx.txIndexInBlock > 0) {
        note = `session chunk boundary: tx #${ctx.txIndexInBlock} starts a new ${MAX_SESSION_CALLS}-tx session, so state changes from earlier chunks are not visible`;
      }
    } else if (ctx.txIndexInBlock > 0) {
      note = `same-block dependency: this is tx #${ctx.txIndexInBlock} in its block; independent per-tx simulation at parent state may explain the mismatch`;
    }
  }

  return {
    status: diffs.length ? "FAIL" : "PASS",
    diffs,
    gasDelta,
    note,
    simTrace,
    chainTrace,
  };
}

// ── runner ──────────────────────────────────────────────────────────────────

function shortHash(h) {
  return `${h.slice(0, 10)}…${h.slice(-6)}`;
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker),
  );
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return 0;
  }
  if (!args.tx && args.startBlock == null) {
    const latest = Number(await rpc(args.rpcUrl, "eth_blockNumber"));
    args.startBlock = latest; // default to latest block
    console.log(
      `No --tx/--start-block given, defaulting to latest block ${latest}`,
    );
  }
  if (args.endBlock == null) args.endBlock = args.startBlock;
  if (args.tx && (args.startBlock != null || args.endBlock != null)) {
    console.error("Use either --tx or --start-block/--end-block, not both");
    return 1;
  }
  if (!Number.isInteger(args.chain) || args.chain <= 0) {
    console.error("--chain must be a positive integer");
    return 1;
  }
  if (args.startBlock != null && args.endBlock < args.startBlock) {
    console.error("--end-block must be >= --start-block");
    return 1;
  }
  if (
    args.maxTxs != null &&
    (!Number.isInteger(args.maxTxs) || args.maxTxs < 1)
  ) {
    console.error("--max-txs must be a positive integer");
    return 1;
  }
  if (!Number.isInteger(args.concurrency) || args.concurrency < 1) {
    console.error("--concurrency must be a positive integer");
    return 1;
  }

  console.log(`rpc: ${args.rpcUrl}`);
  console.log(`api: ${args.api}`);
  console.log(
    `mode: ${args.tx ? "single tx" : args.perTx ? "block / per-tx" : "block / session replay"}`,
  );

  const results = [];

  const printResult = (item, i, total, result) => {
    const blockLabel =
      item.blockNumber != null ? ` block ${Number(item.blockNumber)}` : "";
    const prefix = `[${i + 1}/${total}]${blockLabel}`;
    let line = `${prefix} ${shortHash(item.hash)}  ${result.status}`;
    if (result.status === "PASS" && result.gasDelta != null) {
      line += `  (gas Δ ${result.gasDelta >= 0 ? "+" : ""}${result.gasDelta})`;
    }
    if (result.status === "FAIL") {
      line += `  ${result.diffs.length} diff${result.diffs.length === 1 ? "" : "s"}`;
    }
    if (result.status === "SKIP" || result.status === "ERROR") {
      line += `  ${result.note || ""}`;
    }
    console.log(line);
    if (result.status === "FAIL") {
      const shown = args.verbose ? result.diffs : result.diffs.slice(0, 10);
      for (const d of shown) {
        console.log(
          `  - ${d.path}\n      sim:   ${fmt(d.sim)}\n      chain: ${fmt(d.chain)}`,
        );
      }
      if (!args.verbose && result.diffs.length > shown.length) {
        console.log(`  … ${result.diffs.length - shown.length} more (use -v)`);
      }
      if (result.note) console.log(`  ! ${result.note}`);
    }
    results.push({ ...item, ...result });
  };

  const compareIndependently = async (tx, blockTs, i, total) => {
    let result;
    try {
      const gt = await fetchGroundTruth(args.rpcUrl, tx);
      if (gt.kind !== "ok") {
        result = {
          status: gt.kind === "skip" ? "SKIP" : "ERROR",
          note: gt.note,
        };
      } else {
        const sim = await simulateSingleTx(
          args.api,
          args.chain,
          args.rpcUrl,
          tx,
          blockTs,
        );
        if (!sim.callTrace)
          throw new Error(`simulation returned no callTrace: ${sim.error}`);
        result = diffAgainstChain(sim, gt, {
          txIndexInBlock: 0,
          simMode: "per-tx",
        });
      }
    } catch (err) {
      result = { status: "ERROR", note: err.message };
    }
    printResult(
      { hash: tx.hash, blockNumber: Number(tx.blockNumber) },
      i,
      total,
      result,
    );
  };

  if (args.tx) {
    const tx = await rpc(args.rpcUrl, "eth_getTransactionByHash", [args.tx]);
    if (!tx) {
      console.error("tx not found on RPC");
      return 1;
    }
    console.log(`tx:  ${args.tx}`);
    const blk = await rpc(args.rpcUrl, "eth_getBlockByNumber", [
      tx.blockNumber,
      false,
    ]);
    await compareIndependently(tx, blk ? blk.timestamp : null, 0, 1);
  } else {
    for (let b = args.startBlock; b <= args.endBlock; b++) {
      const block = await rpc(args.rpcUrl, "eth_getBlockByNumber", [
        "0x" + b.toString(16),
        true,
      ]);
      if (!block) {
        console.error(`block ${b} not found on RPC`);
        return 1;
      }
      let blockTxs = block.transactions || [];
      console.log(
        `block ${b}: ${blockTxs.length} tx` +
          (blockTxs.length === 1 ? "" : "s"),
      );
      if (args.maxTxs != null && blockTxs.length > args.maxTxs) {
        blockTxs = blockTxs.slice(0, args.maxTxs);
        console.log(`capped to first ${args.maxTxs} txs (--max-txs)`);
      }

      if (args.perTx) {
        // independent per-tx simulation at the parent-block state
        await mapLimit(blockTxs, args.concurrency, async (tx, i) => {
          await compareIndependently(tx, block.timestamp, i, blockTxs.length);
        });
        continue;
      }

      // session replay: chunks of ≤20 sequential calls sharing forked state,
      // so each tx sees the state changes of the txs before it (like real
      // in-block execution). Chunks restart from the parent block, so state
      // does not carry across chunk boundaries (annotated on failure).
      for (let c = 0; c < blockTxs.length; c += MAX_SESSION_CALLS) {
        const chunk = blockTxs.slice(c, c + MAX_SESSION_CALLS);
        const groundTruth = await mapLimit(
          chunk,
          args.concurrency,
          async (tx) => {
            try {
              return await fetchGroundTruth(args.rpcUrl, tx);
            } catch (err) {
              return { kind: "error", note: err.message };
            }
          },
        );
        let simResults = null;
        let chunkError = null;
        try {
          const data = await simulateSessionChunk(
            args.api,
            args.chain,
            args.rpcUrl,
            b,
            chunk,
          );
          if (!Array.isArray(data.results)) {
            chunkError = `session returned no results: ${data.error || "unknown"}`;
          } else {
            simResults = data.results;
          }
        } catch (err) {
          chunkError = err.message;
        }
        for (let i = 0; i < chunk.length; i++) {
          const tx = chunk[i];
          const gt = groundTruth[i];
          let result;
          if (gt.kind !== "ok") {
            result = {
              status: gt.kind === "skip" ? "SKIP" : "ERROR",
              note: gt.note,
            };
          } else if (chunkError) {
            result = { status: "ERROR", note: chunkError };
          } else {
            const sim = simResults[i];
            if (!sim || !sim.callTrace) {
              result = {
                status: "ERROR",
                note: `session result missing callTrace: ${sim ? sim.error : "no result"}`,
              };
            } else {
              result = diffAgainstChain(sim, gt, {
                txIndexInBlock: c + i,
                simMode: "session",
                isChunkStart: i === 0,
              });
            }
          }
          printResult(tx, c + i, blockTxs.length, result);
        }
      }
    }
  }

  const tally = {
    total: results.length,
    passed: 0,
    failed: 0,
    skipped: 0,
    errors: 0,
  };
  for (const r of results) {
    const key = {
      PASS: "passed",
      FAIL: "failed",
      SKIP: "skipped",
      ERROR: "errors",
    }[r.status];
    if (key) tally[key]++;
  }

  console.log(
    `\ntotal ${tally.total} · passed ${tally.passed} · failed ${tally.failed}` +
      ` · skipped ${tally.skipped} · errors ${tally.errors}`,
  );

  if (args.json) {
    const fs = require("node:fs");
    const os = require("node:os");
    const path = require("node:path");
    const file = path.join(os.tmpdir(), `sim-compare-${Date.now()}.json`);
    const json = JSON.stringify(
      { args: { ...args }, tally, results },
      (_, v) => (typeof v === "bigint" ? v.toString() : v),
      2,
    );
    fs.writeFileSync(file, json);
    console.log(`full report: ${file}`);
  }

  return tally.failed + tally.errors > 0 ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
