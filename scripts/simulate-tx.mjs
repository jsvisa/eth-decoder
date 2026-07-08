#!/usr/bin/env node

const BASE_URL = "http://localhost:3000";
const API_PATH = "/api/simulate-tx";

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const DEPOSIT_TOPIC =
  "0xe1fffcc4923d04b559f4d29a8bfc6cda04eb5b0d3c460751c2402c5c5cc9109c";
const WITHDRAWAL_TOPIC =
  "0x7fcf532c15f0a6db0bd6d0e038bea71d30d808c7d98cb3bf7268a95bf5081b65";
const NATIVE_TOKEN = "0x0000000000000000000000000000000000000000";
const ZERO_ADDR = "0x" + "0".repeat(40);

const CHAIN_NAMES = {
  1: "Ethereum",
  42161: "Arbitrum",
  8453: "Base",
  137: "Polygon",
  56: "BSC",
  10: "Optimism",
  43114: "Avalanche",
  250: "Fantom",
  324: "zkSync Era",
};

function bold(s) {
  return `\x1b[1m${s}\x1b[22m`;
}
function dim(s) {
  return `\x1b[2m${s}\x1b[22m`;
}
function green(s) {
  return `\x1b[32m${s}\x1b[39m`;
}
function red(s) {
  return `\x1b[31m${s}\x1b[39m`;
}
function yellow(s) {
  return `\x1b[33m${s}\x1b[39m`;
}
function cyan(s) {
  return `\x1b[36m${s}\x1b[39m`;
}
function gray(s) {
  return `\x1b[90m${s}\x1b[39m`;
}

function shorten(addr) {
  if (!addr || addr === "0x") return "?";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatValue(val) {
  if (val === null || val === undefined) return "null";
  if (typeof val === "object") return JSON.stringify(val);
  const s = String(val);
  return s.length > 80 ? s.slice(0, 40) + "..." + s.slice(-20) : s;
}

function fmtToken(raw, decimals) {
  try {
    const val = typeof raw === "bigint" ? raw : BigInt(String(raw));
    const absVal = val < 0n ? -val : val;
    if (decimals === 0) return absVal.toLocaleString();
    const divisor = BigInt(10 ** decimals);
    const whole = absVal / divisor;
    const rem = absVal % divisor;
    if (rem === 0n) return whole.toLocaleString();
    const frac = rem
      .toString()
      .padStart(decimals, "0")
      .replace(/0+$/, "")
      .slice(0, 6);
    return `${whole.toLocaleString()}.${frac}`;
  } catch {
    return null;
  }
}

function fmtUsd(v) {
  if (v == null) return "";
  const abs = Math.abs(v);
  return `($${abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
}

// --- Parse event log as token transfer ---
function parseTransfer(log) {
  const topics = log.topics || [];
  const t0 = topics[0];
  const addr = log.address?.toLowerCase();
  if (!addr) return null;
  let value;
  try {
    value = BigInt(log.data || "0x0");
  } catch {
    return null;
  }
  let from, to;
  if (t0 === TRANSFER_TOPIC) {
    if (topics.length < 3) return null;
    from = "0x" + topics[1].slice(-40);
    to = "0x" + topics[2].slice(-40);
  } else if (t0 === DEPOSIT_TOPIC) {
    if (topics.length < 2) return null;
    from = ZERO_ADDR;
    to = "0x" + topics[1].slice(-40);
  } else if (t0 === WITHDRAWAL_TOPIC) {
    if (topics.length < 2) return null;
    from = "0x" + topics[1].slice(-40);
    to = ZERO_ADDR;
  } else return null;
  return {
    tokenAddr: addr,
    from: from.toLowerCase(),
    to: to.toLowerCase(),
    value,
  };
}

// --- Parse CLI args ---
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key.startsWith("--")) {
      const k = key.slice(2);
      if (k === "help" || k === "h") {
        opts.help = true;
        continue;
      }
      const v = args[++i];
      if (v === undefined) {
        console.error(`Missing value for ${key}`);
        process.exit(1);
      }
      if (k === "json") opts.json = true;
      else if (k === "yaml") opts.yaml = true;
      else opts[k] = v;
    }
  }
  return opts;
}

function printUsage() {
  console.log(`
${bold("Usage:")} node scripts/simulate-tx.mjs [options]

${bold("Required:")}
  --to <addr>       Contract address
  --from <addr>     Sender address
  --data <hex>      Transaction calldata

${bold("Optional:")}
  --chainId <n>     Chain ID (default: 1)
  --value <hex>     Value in wei (default: 0x0)
  --gas <int|hex>   Gas limit
  --block <int|hex|latest>  Block number (default: latest)
  --rpc <url>       Custom RPC URL
  --url <url>       API base URL (default: ${BASE_URL})
  --json            Output raw JSON
  --yaml            Output raw YAML (requires js-yaml installed)
  --help            Show this help
`);
}

// --- Formatting ---

function printTxInfo(r) {
  const chainName =
    CHAIN_NAMES[Number(r.blockNumber || 0)] || `Chain ${r.blockNumber || "?"}`;
  console.log(`\n${bold("Transaction Info")}`);
  console.log(`  ${gray("Chain:")}       ${chainName}`);
  console.log(`  ${gray("From:")}        ${r.callTrace?.from || "?"}`);
  console.log(`  ${gray("To:")}          ${r.callTrace?.to || "?"}`);
  if (r.callTrace?.functionName)
    console.log(`  ${gray("Function:")}    ${r.callTrace.functionName}`);
  if (r.gasUsed != null)
    console.log(
      `  ${gray("Gas Used:")}    ${Number(r.gasUsed).toLocaleString()}`,
    );
  if (r.callTrace?.value && r.callTrace.value !== "0") {
    const valEth = Number(BigInt(r.callTrace.value)) / 1e18;
    console.log(`  ${gray("Value:")}       ${valEth} ETH`);
  }
  if (r.error) console.log(`  ${red("Error:")}       ${r.error}`);
}

function printCallTrace(trace, indent = 0) {
  if (!trace) return;
  if (trace.type === "STATICCALL") return;
  const pad = "  ".repeat(indent);
  const contractName = trace.toName || shorten(trace.to) || "?";
  const funcName = trace.functionName || trace.input?.slice(0, 10) || "()";
  const typeTag = trace.type === "CALL" ? "" : ` ${dim(trace.type)}`;
  const valueTag =
    trace.value && trace.value !== "0"
      ? ` ${yellow(`${fmtToken(trace.value, 18)} ETH`)}`
      : "";
  const gasTag = trace.gasUsed
    ? ` ${gray(`[${Number(trace.gasUsed).toLocaleString()} gas]`)}`
    : "";
  const errorTag = trace.error
    ? ` ${red("✗ " + (trace.errorReason || trace.error))}`
    : "";

  const inputStr =
    trace.decodedInputs
      ?.map((p) => `${p.name}=${formatValue(p.value)}`)
      .join(", ") || "";
  const outputStr =
    trace.decodedOutputs
      ?.map((p) => {
        const s = formatValue(p.value);
        return p.name && p.name !== "unknown" ? `${p.name}=${s}` : s;
      })
      .join(", ") || "";

  console.log(
    `${pad}${cyan("──")} ${bold(contractName)}${typeTag}${gray(".")}${bold(funcName)}${gray(`(${inputStr})`)}${outputStr ? ` ${gray("→")} ${gray(`(${outputStr})`)}` : ""}${valueTag}${gasTag}${errorTag}`,
  );

  if (trace.logs?.length > 0) {
    for (const log of trace.logs) {
      const logParams =
        log.inputs
          ?.map((p) => `${p.name}=${formatValue(p.value)}`)
          .join(", ") || "";
      console.log(
        `${pad}  ${gray("📝")} ${log.name}${logParams ? `(${dim(logParams)})` : ""}`,
      );
    }
  }

  if (trace.calls?.length > 0) {
    for (const child of trace.calls) printCallTrace(child, indent + 1);
  }
}

function printEventLogs(logs) {
  if (!logs?.length) return;
  const names = [...new Set(logs.map((l) => l.name || "Unknown Event"))];
  console.log(`\n${bold("Event Logs")} ${gray(`(${logs.length})`)}`);
  for (const name of names) {
    const filtered = logs.filter((l) => (l.name || "Unknown Event") === name);
    console.log(`  ${bold(name)} ${gray(`(${filtered.length})`)}`);
    for (const log of filtered) {
      const contract = log.address ? dim(shorten(log.address)) : "";
      const params =
        log.inputs
          ?.map((p) => {
            let v = formatValue(p.value);
            if (
              p.name === "from" ||
              p.name === "to" ||
              p.name === "src" ||
              p.name === "dst"
            )
              v = shorten(v);
            return `${p.name}=${v}`;
          })
          .join(", ") || "";
      console.log(
        `    #${log.logIndex ?? ""} ${gray(`${log.name}(${params})`)} ${contract}`,
      );
    }
  }
}

function printBalanceTable(r) {
  const accountMap = {};
  for (const log of r.logs || []) {
    const t = parseTransfer(log);
    if (!t) continue;
    if (!accountMap[t.from]) accountMap[t.from] = { native: null, tokens: {} };
    if (!accountMap[t.to]) accountMap[t.to] = { native: null, tokens: {} };
    accountMap[t.from].tokens[t.tokenAddr] =
      (accountMap[t.from].tokens[t.tokenAddr] || 0n) - t.value;
    accountMap[t.to].tokens[t.tokenAddr] =
      (accountMap[t.to].tokens[t.tokenAddr] || 0n) + t.value;
  }
  for (const change of r.balanceChanges || []) {
    const addr = change.address?.toLowerCase();
    if (!addr || change.diff == null) continue;
    if (!accountMap[addr]) accountMap[addr] = { native: null, tokens: {} };
    accountMap[addr].native = change.diff;
  }

  const rows = [];
  for (const [addr, data] of Object.entries(accountMap)) {
    if (data.native != null) {
      let diff;
      try {
        diff = BigInt(String(data.native));
      } catch {
        diff = null;
      }
      if (diff !== null && diff !== 0n) {
        const tag = diff > 0n ? green : red;
        rows.push({
          addr,
          symbol: "ETH",
          tokenAddr: NATIVE_TOKEN,
          diff,
          formatted: tag(`${diff > 0n ? "+" : ""}${fmtToken(diff, 18)}`),
        });
      }
    }
    for (const [tokenAddr, rawDiff] of Object.entries(data.tokens)) {
      if (rawDiff === 0n) continue;
      const tag = rawDiff > 0n ? green : red;
      const sym = tokenAddr === NATIVE_TOKEN ? "ETH" : shorten(tokenAddr);
      rows.push({
        addr,
        symbol: sym,
        tokenAddr,
        diff: rawDiff,
        formatted: tag(`${rawDiff > 0n ? "+" : ""}${fmtToken(rawDiff, 18)}`),
      });
    }
  }

  if (!rows.length) return;

  console.log(`\n${bold("Balance Changes")}`);
  console.log(
    `  ${gray("Address".padEnd(48))} ${"Token".padEnd(10)} ${"Change".padEnd(20)}`,
  );
  console.log(`  ${gray("─".repeat(48))} ${"─".repeat(10)} ${"─".repeat(20)}`);
  for (const row of rows) {
    console.log(
      `  ${dim(shorten(row.addr)).padEnd(48)} ${row.symbol.padEnd(10)} ${row.formatted.padEnd(20)}`,
    );
  }
}

function printStateChanges(r) {
  if (!r.stateChanges?.length) return;
  console.log(
    `\n${bold("State Changes")} ${gray(`(${r.stateChanges.length} contracts)`)}`,
  );
  for (const sc of r.stateChanges) {
    const addr = sc.address ? shorten(sc.address) : "?";
    console.log(
      `  ${bold(addr)} ${gray(`(${sc.changes?.length || 0} slots)`)}`,
    );
    for (const change of (sc.changes || []).slice(0, 10)) {
      const key = change.key ? dim(change.key.slice(0, 10) + "…") : "?";
      const before = change.original
        ? dim(change.original.slice(0, 10) + "…")
        : "?";
      const after = change.dirty ? dim(change.dirty.slice(0, 10) + "…") : "?";
      console.log(`    ${key}  ${gray(`${before} → ${after}`)}`);
    }
    if ((sc.changes?.length || 0) > 10)
      console.log(`    ${gray(`… and ${sc.changes.length - 10} more`)}`);
  }
}

// --- Main ---

async function main() {
  const opts = parseArgs();
  if (opts.help || (!opts.to && !opts.data && !opts.from)) {
    printUsage();
    process.exit(opts.help ? 0 : 1);
  }

  const body = {
    chainId: opts.chainId || "1",
    to: opts.to,
    from: opts.from,
    data: opts.data,
    value: opts.value || "0x0",
    ...(opts.gas ? { gas: opts.gas } : {}),
    ...(opts.block ? { blockNumber: opts.block } : {}),
    ...(opts.rpc ? { rpcUrl: opts.rpc } : {}),
  };

  const baseUrl = opts.url || BASE_URL;
  const url = `${baseUrl.replace(/\/$/, "")}${API_PATH}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();

    if (result.error) {
      console.error(red(`Error: ${result.error}`));
      process.exit(1);
    }

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (opts.yaml) {
      let yaml;
      try {
        const jsyaml = await import("js-yaml");
        yaml = jsyaml.default.dump(result, {
          indent: 2,
          lineWidth: -1,
          noRefs: true,
        });
      } catch {
        console.error(
          red("js-yaml not available. Install with: npm install js-yaml"),
        );
        process.exit(1);
      }
      console.log(yaml);
      return;
    }

    const r = result;

    console.log(gray("═══════════════════════════════════════════════════"));
    console.log(bold(`Simulation Result ${r.success ? green("✓") : red("✗")}`));
    console.log(gray("═══════════════════════════════════════════════════"));

    printTxInfo(r);
    if (r.callTrace) {
      console.log(`\n${bold("Call Trace")}`);
      printCallTrace(r.callTrace);
    }
    printEventLogs(r.logs);
    if (r.assetChanges?.length) {
      console.log(
        `\n${bold("Asset Changes")} ${gray(`(${r.assetChanges.length})`)}`,
      );
      for (const ac of r.assetChanges) {
        const sym = ac.token_info?.symbol || ac.token_info?.name || "?";
        const from = shorten(ac.from);
        const to = shorten(ac.to);
        const amt = ac.amount || ac.raw_amount || "?";
        const usd = ac.dollar_value ? ` ${gray(fmtUsd(ac.dollar_value))}` : "";
        console.log(
          `  ${dim(ac.type || "TRANSFER")} ${green(sym)}  ${from} ${gray("→")} ${to}  ${amt}${usd}`,
        );
      }
    }
    printBalanceTable(r);
    printStateChanges(r);

    if (r.metrics) {
      console.log(`\n${bold("Metrics")}`);
      console.log(
        `  ${gray("Time:")}  ${r.metrics.totalMs ? `${r.metrics.totalMs.toFixed(0)}ms` : "?"}`,
      );
      if (r.metrics.phases) {
        for (const [phase, ms] of Object.entries(r.metrics.phases)) {
          console.log(`    ${gray(phase)}: ${ms.toFixed(0)}ms`);
        }
      }
      if (r.metrics.rpc?.methods) {
        const total = Object.values(r.metrics.rpc.methods).reduce(
          (a, b) => a + b,
          0,
        );
        console.log(`  ${gray("RPC Calls:")} ${total}`);
      }
    }
  } catch (err) {
    console.error(red(`Request failed: ${err.message}`));
    process.exit(1);
  }
}

main();
