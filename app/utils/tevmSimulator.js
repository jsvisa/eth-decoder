import { createMemoryClient, http } from "tevm";
import {
  encodeFunctionData,
  decodeFunctionData,
  decodeFunctionResult,
  decodeErrorResult,
  parseEther,
  decodeEventLog,
  keccak256,
  bytesToHex,
  toFunctionSelector,
} from "viem";
import { isValidEthAddress } from "./validation";

// Create an http transport with or without JSON-RPC batching.
// batchSize=1 → http(url) with NO batch option — guarantees single {…} request
//               format, compatible with all RPCs including those that reject arrays.
// batchSize>1 → http(url, { batch: {…} }) — packs up to batchSize requests into
//               one HTTP call as [{…}, {…}, …].
function makeHttp(url, batchSize = 1) {
  return batchSize > 1
    ? http(url, { batch: { batchSize, wait: 0 } })
    : http(url);
}

// Wraps an HTTP transport to avoid eth_getProof, which is unsupported by many
// public RPCs. Intercepts eth_getProof and emulates it with eth_getBalance +
// eth_getCode only — nonce is omitted because it is irrelevant for CALL
// simulation (only matters for CREATE address derivation, which is rare).
// Storage slots are unaffected since tevm already uses eth_getStorageAt.
function createProofFreeTransport(rpcUrl, batchSize = 1) {
  const baseHttp = makeHttp(rpcUrl, batchSize);
  return (config) => {
    const base = baseHttp(config);
    return {
      ...base,
      request: async ({ method, params }) => {
        if (method === "eth_getProof") {
          const [address, , blockTag] = params ?? [];
          const tag = blockTag ?? "latest";
          const [balance, code] = await Promise.all([
            base.request({ method: "eth_getBalance", params: [address, tag] }),
            base.request({ method: "eth_getCode", params: [address, tag] }),
          ]);
          return {
            address,
            accountProof: [],
            balance,
            nonce: "0x0", // nonce unused in CALL simulation
            codeHash: keccak256(code),
            storageHash:
              "0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421",
            storageProof: [],
          };
        }
        return base.request({ method, params });
      },
    };
  };
}

// Chain configurations for forking (built-in chains)
const BUILT_IN_CHAIN_CONFIGS = {
  ethereum: { chainId: 1, name: "Ethereum" },
  arbitrum: { chainId: 42161, name: "Arbitrum" },
  base: { chainId: 8453, name: "Base" },
  polygon: { chainId: 137, name: "Polygon" },
  bsc: { chainId: 56, name: "BSC" },
};

// Default public RPCs (fallback)
const DEFAULT_RPCS = {
  ethereum: "https://ethereum-rpc.publicnode.com",
  arbitrum: "https://arbitrum-one-rpc.publicnode.com",
  base: "https://base-rpc.publicnode.com",
  polygon: "https://polygon-bor-rpc.publicnode.com",
  bsc: "https://bsc-rpc.publicnode.com",
};

// Helper to parse an argument value based on ABI type
const parseArgValue = (arg, input) => {
  if (arg === undefined || arg === null || arg === "") {
    return arg;
  }

  const type = input.type;

  // Handle integer types
  if (type.startsWith("uint") || type.startsWith("int")) {
    try {
      return BigInt(arg);
    } catch {
      return arg;
    }
  }

  // Handle boolean
  if (type === "bool") {
    return arg === "true" || arg === true;
  }

  // Handle tuple types
  if (type === "tuple" || type.startsWith("tuple")) {
    // If it's already an object/array, recursively parse components
    let tupleValue = arg;
    if (typeof arg === "string") {
      try {
        // Try to parse as JSON first
        tupleValue = JSON.parse(arg);
      } catch {
        // If not valid JSON, try to parse as comma-separated values
        // This handles cases like "value1,value2,value3"
        const parts = arg.split(",").map((s) => s.trim());
        tupleValue = parts;
      }
    }

    // If it's a tuple array (tuple[])
    if (type === "tuple[]") {
      if (!Array.isArray(tupleValue)) {
        return arg;
      }
      return tupleValue.map((item) =>
        parseArgValue(item, { ...input, type: "tuple" }),
      );
    }

    // For single tuple, parse each component
    if (input.components && Array.isArray(tupleValue)) {
      const parsed = tupleValue.map((val, idx) => {
        const component = input.components[idx];
        if (!component) return val;
        return parseArgValue(val, component);
      });
      return parsed;
    }

    return tupleValue;
  }

  // Handle bytes / bytesN - require 0x-prefixed hex.
  // The regex /^bytes\d+$/ matches bytes32, bytes16 etc. but NOT bytes32[] or
  // bytes32[N] because $ anchors before the brackets, so array types fall
  // through to the branch below correctly.
  if (type === "bytes" || /^bytes\d+$/.test(type)) {
    if (typeof arg === "string" && arg !== "" && !arg.startsWith("0x")) {
      const isHexChars = /^[0-9a-fA-F]+$/.test(arg);
      if (isHexChars) {
        throw new Error(
          `Invalid ${type}: value looks like a hex string missing the "0x" prefix. Try "0x${arg}".`,
        );
      }
      throw new Error(`Invalid ${type}: expected a "0x"-prefixed hex string.`);
    }
    return arg;
  }

  // Handle dynamic arrays (type[]) and fixed-size arrays (type[N]).
  // Strips the outermost bracket pair and recurses, so bytes32[6] is treated
  // the same as bytes32[].
  const arrayMatch = type.match(/^(.+)\[(\d*)\]$/);
  if (arrayMatch) {
    const baseType = arrayMatch[1];
    let arrayValue = arg;
    if (typeof arg === "string") {
      try {
        arrayValue = JSON.parse(arg);
      } catch {
        return arg;
      }
    }
    if (!Array.isArray(arrayValue)) {
      return arg;
    }
    return arrayValue.map((item) =>
      parseArgValue(item, { ...input, type: baseType }),
    );
  }

  return arg;
};

// Helper to serialize BigInt values for JSON
const serializeValue = (value) => {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(serializeValue);
  if (value && typeof value === "object") {
    const serialized = {};
    for (const key in value) {
      serialized[key] = serializeValue(value[key]);
    }
    return serialized;
  }
  return value;
};

// Batch-decode undecoded logs using the /api/decode-event server endpoint.
// Mutates log objects in-place and returns the updated array.
export async function decodeLogsViaServer(logs) {
  if (!logs || logs.length === 0) return logs;
  const undecoded = logs.filter(
    (log) => !log.decoded && log.topics?.length > 0,
  );
  if (undecoded.length === 0) return logs;

  await Promise.all(
    undecoded.map(async (log) => {
      try {
        const topic0 = log.topics[0];
        const params = new URLSearchParams({
          sign: topic0,
          topics: log.topics.join(","),
          data: log.data || "0x",
        });
        const res = await fetch(`/api/decode-event?${params}`);
        if (!res.ok) return;
        const json = await res.json();
        if (json.msg !== "ok" || !json.data) return;
        const { event, args, inputs: abiInputs } = json.data;
        log.name = event;
        log.decoded = true;
        // Use ABI inputs for proper type and indexed flags when available,
        // falling back to plain name/value pairs if not.
        if (abiInputs?.length > 0) {
          log.inputs = abiInputs.map((inp) => ({
            name: inp.name || "",
            type: inp.type || "unknown",
            value: String(args?.[inp.name] ?? ""),
            indexed: inp.indexed || false,
          }));
        } else {
          log.inputs = Object.entries(args || {}).map(([name, value]) => ({
            name,
            type: "unknown",
            value: String(value),
            indexed: false,
          }));
        }
      } catch {
        /* leave undecoded */
      }
    }),
  );

  return logs;
}

// Recursively call decodeLogsViaServer for every frame in the call trace tree
export async function decodeCallTraceLogsViaServer(node) {
  if (!node) return;
  await decodeLogsViaServer(node.logs || []);
  await Promise.all(
    (node.calls || []).map((child) => decodeCallTraceLogsViaServer(child)),
  );
}

// Decode revert data into a human-readable string.
// Handles Error(string), Panic(uint256), and custom ABI errors via viem's decodeErrorResult.
// Uses viem throughout — avoids Buffer.from which is unreliable in browser bundles.
function decodeRevertData(hexData, abi = []) {
  if (!hexData || hexData.length < 10) return null;
  const PANIC_CODES = {
    0x00: "generic panic",
    0x01: "assert failed",
    0x11: "arithmetic overflow/underflow",
    0x12: "division by zero",
    0x21: "invalid enum value",
    0x22: "corrupted storage array",
    0x31: "pop on empty array",
    0x32: "array index out of bounds",
    0x41: "out of memory",
    0x51: "zero function pointer",
  };
  try {
    const errorAbis = (abi || []).filter((item) => item.type === "error");
    // decodeErrorResult handles Error(string) and Panic(uint256) natively
    // even with an empty ABI array; custom errors need their definition.
    const { errorName, args } = decodeErrorResult({
      abi: errorAbis,
      data: hexData,
    });
    if (errorName === "Error") return String(args?.[0] ?? "");
    if (errorName === "Panic") {
      const code = Number(args?.[0] ?? 0);
      return `Panic: ${PANIC_CODES[code] ?? `code 0x${code.toString(16)}`}`;
    }
    // Custom error
    if (!args?.length) return errorName;
    const formatted = args
      .map((a) => {
        const s = serializeValue(a);
        return typeof s === "object" ? JSON.stringify(s) : String(s);
      })
      .join(", ");
    return `${errorName}(${formatted})`;
  } catch {
    return null;
  }
}

export { decodeRevertData };

// Try to decode a single raw log object ({ address, topics, data }) using the event ABI map.
// Returns the enriched log with { name, decoded, inputs } fields.
function tryDecodeLog(log, eventAbisByAddress) {
  const topics = log.topics || [];
  const data = log.data || "0x";
  const logAddress = log.address?.toLowerCase();
  const addressAbis = eventAbisByAddress.get(logAddress) || [];

  // Try address-specific ABIs first, then all known ABIs (fallback for common events)
  const candidates = [
    ...addressAbis,
    ...[...eventAbisByAddress.values()].flat(),
  ];
  for (const eventAbi of candidates) {
    try {
      const decoded = decodeEventLog({ abi: [eventAbi], data, topics });
      return {
        address: log.address,
        topics,
        data,
        name: decoded.eventName,
        decoded: true,
        inputs: eventAbi.inputs.map((inp, i) => ({
          name: inp.name || `arg${i}`,
          type: inp.type,
          value: serializeValue(decoded.args[inp.name] ?? decoded.args[i]),
          indexed: inp.indexed || false,
        })),
      };
    } catch {
      /* try next */
    }
  }
  return {
    address: log.address,
    topics,
    data,
    name: null,
    decoded: false,
    inputs: [],
  };
}

// Recursively decode all logs in a call trace tree in-place.
// Returns Set of lowercase addresses whose logs could not be decoded.
function decodeLogsInTree(node, eventAbisByAddress) {
  if (!node) return new Set();
  const undecoded = new Set();
  node.logs = node.logs.map((log) => {
    const result = tryDecodeLog(log, eventAbisByAddress);
    if (!result.decoded && log.address)
      undecoded.add(log.address.toLowerCase());
    return result;
  });
  for (const child of node.calls || []) {
    for (const addr of decodeLogsInTree(child, eventAbisByAddress))
      undecoded.add(addr);
  }
  return undecoded;
}

// Remove from undecodedSet any address that was successfully decoded somewhere in the tree
function pruneDecodedAddresses(node, undecodedSet) {
  if (!node) return;
  for (const log of node.logs || []) {
    if (log.decoded && log.address)
      undecodedSet.delete(log.address.toLowerCase());
  }
  for (const child of node.calls || [])
    pruneDecodedAddresses(child, undecodedSet);
}

// Recursively remove STATICCALL nodes from the call tree
function pruneStaticCalls(node) {
  if (!node) return;
  node.calls = (node.calls || []).filter((c) => c.type !== "STATICCALL");
  node.calls.forEach(pruneStaticCalls);
}

// Collect addresses of sub-call nodes that couldn't be decoded (no functionName
// despite having calldata). These are fed into the ABI-fetch pipeline so a
// second pass can decode them.
function collectUndecodedCallAddresses(node, result = new Set()) {
  if (!node) return result;
  // Skip root (depth 0) — it's decoded via the known ABI, not the selector map
  for (const child of node.calls || []) {
    if (
      child.functionName === null &&
      child.input &&
      child.input.length >= 10 &&
      child.to
    ) {
      result.add(child.to.toLowerCase());
    }
    collectUndecodedCallAddresses(child, result);
  }
  return result;
}

// Flatten all logs from the entire call trace tree into a single array (for the Logs tab)
function flattenLogsFromTree(node) {
  if (!node) return [];
  return [
    ...(node.logs || []),
    ...(node.calls || []).flatMap(flattenLogsFromTree),
  ];
}

// Build a map of 4-byte selector (e.g. "0xabcd1234") → functionAbi
// from the main ABI and all cached ABIs, so sub-calls can be decoded.
function buildSelectorMap(abi, abiCache) {
  const map = new Map();
  const add = (abiFrag) => {
    if (!abiFrag || abiFrag.type !== "function") return;
    try {
      const selector = toFunctionSelector(abiFrag);
      if (!map.has(selector)) map.set(selector, abiFrag);
    } catch {
      /* skip malformed entries */
    }
  };
  (abi || []).forEach(add);
  for (const [, cachedAbi] of abiCache || new Map()) {
    (cachedAbi || []).forEach(add);
  }
  return map;
}

// Recursively decode function name + inputs/outputs for every sub-call node
// whose input starts with a known 4-byte selector.
function decodeSubCallNodes(node, selectorMap) {
  if (!node) return;
  // Skip the root — it's already annotated with the known functionAbi
  for (const child of node.calls || []) {
    _decodeCallNode(child, selectorMap);
  }
}

function _decodeCallNode(node, selectorMap) {
  if (!node) return;
  // STATICCALLs are read-only view calls — skip decoding them and their subtree
  if (node.type === "STATICCALL") return;
  const input = node.input;
  if (input && input.length >= 10) {
    const selector = input.slice(0, 10).toLowerCase();
    const funcAbi = selectorMap.get(selector);
    if (funcAbi) {
      try {
        const { functionName, args } = decodeFunctionData({
          abi: [funcAbi],
          data: input,
        });
        node.functionName = functionName;
        node.decodedInputs = funcAbi.inputs.map((inp, i) => ({
          name: inp.name || `input${i}`,
          type: inp.type,
          value: serializeValue(Array.isArray(args) ? args[i] : args),
        }));
      } catch {
        /* leave undecoded */
      }

      // Decode output if the call succeeded and we know the return types
      if (
        node.output &&
        node.output !== "0x" &&
        !node.error &&
        funcAbi.outputs?.length > 0
      ) {
        try {
          const decoded = decodeFunctionResult({
            abi: [funcAbi],
            functionName: funcAbi.name,
            data: node.output,
          });
          node.decodedOutputs =
            funcAbi.outputs.length === 1
              ? [
                  {
                    name: funcAbi.outputs[0].name || "result",
                    type: funcAbi.outputs[0].type,
                    value: serializeValue(decoded),
                  },
                ]
              : funcAbi.outputs.map((out, i) => ({
                  name: out.name || `output${i}`,
                  type: out.type,
                  value: serializeValue(
                    Array.isArray(decoded) ? decoded[i] : decoded[out.name],
                  ),
                }));
        } catch {
          /* leave undecoded */
        }
      }
    }
  }
  for (const child of node.calls || []) {
    _decodeCallNode(child, selectorMap);
  }
}

/**
 * Create a Tevm memory client with forking support
 * @param {string} chain - Chain identifier
 * @param {string} rpcUrl - Optional custom RPC URL
 * @param {string|number} blockNumber - Block number or tag ('latest')
 * @param {number} customChainId - Optional custom chain ID for non-built-in chains
 * @returns {Promise<{client: any, blockNumber: string}>}
 */
export async function createTevmClient(
  chain,
  rpcUrl,
  blockNumber = "latest",
  customChainId = null,
  batchSize = 1,
) {
  // Get chain config from built-in or use custom chain ID
  let chainConfig = BUILT_IN_CHAIN_CONFIGS[chain];

  // Handle custom chains
  if (!chainConfig && customChainId) {
    chainConfig = { chainId: customChainId, name: chain };
  }

  if (!chainConfig) {
    throw new Error(
      `Unsupported chain: ${chain}. Please provide a custom chain ID.`,
    );
  }

  const forkUrl = rpcUrl || DEFAULT_RPCS[chain];
  if (!forkUrl) {
    throw new Error(`No RPC URL configured for ${chain}`);
  }

  // Parse block number - treat empty string as 'latest'
  let blockTag = "latest";
  if (blockNumber && blockNumber !== "latest") {
    const numericBlock =
      typeof blockNumber === "string"
        ? blockNumber.trim()
        : String(blockNumber);
    if (numericBlock && /^\d+$/.test(numericBlock)) {
      blockTag = BigInt(numericBlock);
    }
  }

  // Create fork client with the specified block tag
  const client = createMemoryClient({
    fork: {
      transport: createProofFreeTransport(forkUrl, batchSize),
      blockTag,
    },
  });

  await client.tevmReady();

  return {
    client,
    blockNumber: blockTag === "latest" ? "latest" : blockTag.toString(),
  };
}

/**
 * Apply cheatcodes to the Tevm client
 */
export async function applyCheatcodes(client, cheatcodes = {}) {
  const { deal, prank, warp } = cheatcodes;

  // vm.deal - Set ETH balance for an address
  if (deal && deal.address && deal.amount) {
    await client.tevmSetAccount({
      address: deal.address,
      balance: parseEther(deal.amount.toString()),
    });
  }

  // vm.warp - Set block timestamp
  if (
    warp &&
    warp.timestamp !== undefined &&
    warp.timestamp !== null &&
    warp.timestamp !== ""
  ) {
    try {
      const timestamp =
        typeof warp.timestamp === "bigint"
          ? warp.timestamp
          : BigInt(warp.timestamp);
      await client.tevmMine({
        blockCount: 1,
        timestamp,
      });
    } catch (err) {
      console.warn("Failed to apply warp cheatcode:", err.message);
    }
  }

  // vm.prank is handled by setting the 'from' address in the call
  return {
    prankAddress: prank?.address || null,
  };
}

/**
 * Prefetch accounts + storage slots into tevm's state cache before simulation.
 *
 * Two-tier strategy:
 *   Tier 1 — always runs, needs only eth_getCode + eth_getBalance (universal):
 *     Prefetches the target contract so the first and most predictable account
 *     load never stalls execution.
 *
 *   Tier 2 — best-effort, requires eth_createAccessList:
 *     Discovers the full set of addresses AND storage slots the tx will touch,
 *     then fetches everything in one parallel batch. With batchSize > 1 all
 *     requests go out in a single HTTP call (JSON-RPC batch array), reducing
 *     N sequential round trips to ceil(N / batchSize) round trips.
 *     Silently skipped if the RPC doesn't support eth_createAccessList.
 */
async function prefetchAccountsFromAccessList({
  client,
  forkRpcUrl,
  callParams,
  blockTag,
  batchSize = 1,
}) {
  const transport = makeHttp(forkRpcUrl, batchSize)({});
  const tag =
    blockTag === "latest" ? "latest" : `0x${BigInt(blockTag).toString(16)}`;

  // Tier 1: always prefetch the target contract
  try {
    const [code, balance] = await Promise.all([
      transport.request({
        method: "eth_getCode",
        params: [callParams.to, tag],
      }),
      transport.request({
        method: "eth_getBalance",
        params: [callParams.to, tag],
      }),
    ]);
    await client.tevmSetAccount({
      address: callParams.to,
      balance: BigInt(balance),
      deployedBytecode: code,
    });
  } catch {
    /* will lazy-load */
  }

  // Tier 2: eth_createAccessList → batch-fetch all accounts + storage slots
  try {
    const alResult = await transport.request({
      method: "eth_createAccessList",
      params: [
        {
          to: callParams.to,
          from: callParams.from,
          data: callParams.data,
          ...(callParams.value > 0n
            ? { value: `0x${callParams.value.toString(16)}` }
            : {}),
        },
        tag,
      ],
    });

    // Build address → storageKeys map from access list
    const addrMap = new Map(); // addr (lowercase) → string[]
    for (const item of alResult?.accessList ?? []) {
      const addr = item.address?.toLowerCase();
      if (!addr) continue;
      if (!addrMap.has(addr)) addrMap.set(addr, []);
      for (const slot of item.storageKeys ?? []) addrMap.get(addr).push(slot);
    }

    // One Promise.all over all addresses — with batch transport all requests
    // for all addresses (code, balance, and every storage slot) are packed into
    // ceil(totalRequests / batchSize) HTTP calls instead of N individual ones.
    await Promise.all(
      [...addrMap.entries()].map(async ([addr, slots]) => {
        try {
          const [code, balance, ...storageValues] = await Promise.all([
            transport.request({ method: "eth_getCode", params: [addr, tag] }),
            transport.request({
              method: "eth_getBalance",
              params: [addr, tag],
            }),
            ...slots.map((slot) =>
              transport.request({
                method: "eth_getStorageAt",
                params: [addr, slot, tag],
              }),
            ),
          ]);

          const state = {};
          slots.forEach((slot, i) => {
            state[slot] = storageValues[i];
          });

          await client.tevmSetAccount({
            address: addr,
            balance: BigInt(balance),
            deployedBytecode: code,
            ...(slots.length > 0 ? { state } : {}),
          });
        } catch {
          /* skip this address, lazy-load during execution */
        }
      }),
    );
  } catch {
    /* eth_createAccessList unsupported — tier 1 prefetch is still active */
  }
}

/**
 * Inner simulation body. Accepts an already-created tevm client and runs the
 * full simulation on it. Not exported — callers use simulateWithTevm or
 * simulateWithClient.
 */
async function _runSimulationOnClient(client, pinnedBlock, params) {
  const {
    chain,
    address,
    functionName,
    args,
    abi,
    fromAddress,
    value,
    valueUnit = "ETH",
    rpcUrl,
    cheatcodes = {},
    abiCache = new Map(),
    onProgress = null,
    abortSignal = null,
    rpcBatchSize = 1,
    callData: rawCallData = null,
  } = params;

  // Validate inputs before the try/catch so callers receive a rejected promise
  // rather than a resolved { success: false } for programmer errors.
  if (!address || !functionName || !abi) {
    throw new Error("Missing required parameters: address, functionName, abi");
  }
  if (!isValidEthAddress(address)) {
    throw new Error("Invalid address format");
  }

  try {
    // Find the function in ABI — supports both plain name and full signature (e.g. "transfer(address,uint256)")
    const functionAbi = abi.find((item) => {
      if (item.type !== "function") return false;
      if (functionName.includes("(")) {
        const types = item.inputs?.map((i) => i.type).join(",") || "";
        return `${item.name}(${types})` === functionName;
      }
      return item.name === functionName;
    });

    if (!functionAbi) {
      throw new Error(`Function ${functionName} not found in ABI`);
    }

    // Parse args based on types
    const parsedArgs = (args || []).map((arg, index) => {
      const input = functionAbi.inputs[index];
      if (!input) return arg;
      return parseArgValue(arg, input);
    });

    // Apply cheatcodes
    const { prankAddress } = await applyCheatcodes(client, cheatcodes);

    // Determine sender address
    const sender =
      prankAddress ||
      fromAddress ||
      "0x0000000000000000000000000000000000000001";

    // If using deal cheatcode, ensure sender has funds
    if (cheatcodes.deal?.address === sender) {
      // Already applied in applyCheatcodes
    } else if (
      !fromAddress ||
      fromAddress === "0x0000000000000000000000000000000000000001"
    ) {
      // Give the default sender some ETH for gas
      await client.tevmSetAccount({
        address: sender,
        balance: parseEther("1000"),
      });
    }

    // Encode the function call (or use raw calldata if provided)
    const callData =
      rawCallData ||
      encodeFunctionData({
        abi: [functionAbi],
        functionName: functionAbi.name,
        args: parsedArgs,
      });

    // Convert value to wei based on unit
    let valueInWei = 0n;
    if (value) {
      try {
        if (valueUnit === "Wei") {
          // Value is already in Wei
          valueInWei = BigInt(value);
        } else {
          // Value is in ETH, convert to Wei
          if (parseFloat(value) > 0) {
            valueInWei = parseEther(value);
          }
        }
      } catch (e) {
        console.warn("Failed to parse value:", e.message);
      }
    }

    // ── Account prefetch ────────────────────────────────────────────────────
    // The main latency source is sequential per-account state fetches during
    // execution: the EVM blocks on each new address it encounters. We front-load
    // this by calling eth_createAccessList first (one round trip) to learn which
    // accounts the tx will touch, then fetching all of them in parallel before
    // the EVM starts. Accounts already in tevm's cache are never fetched again.
    const resolvedBlockTag =
      !pinnedBlock || pinnedBlock === "latest"
        ? "latest"
        : String(pinnedBlock).trim();

    await prefetchAccountsFromAccessList({
      client,
      forkRpcUrl: rpcUrl || DEFAULT_RPCS[chain] || "",
      callParams: {
        to: address,
        from: sender,
        data: callData,
        value: valueInWei,
      },
      blockTag: resolvedBlockTag,
      batchSize: rpcBatchSize,
    });

    // ── callTracer implementation (forge/anvil/geth style) ──────────────────
    // Uses three hooks mirroring go-ethereum's callTracer / revm's Inspector:
    //   onBeforeMessage  → push a new call frame onto the stack
    //   onAfterMessage   → pop the frame, fill gasUsed/output/error, nest into parent
    //   onStep           → intercept LOG0-LOG4 opcodes to attach logs to their
    //                      emitting frame (not the root), exactly as geth's OnLog does
    const callStack = [];
    let callTraceRoot = null;
    const LOG_OPCODES = new Set(["LOG0", "LOG1", "LOG2", "LOG3", "LOG4"]);

    // Progress tracking: estimate via gas consumed at root depth.
    // rootGasLimit captured on the first beforeMessage; stepCount throttles updates.
    let rootGasLimit = 0n;
    let stepCount = 0;

    const onBeforeMessage = (message, next) => {
      let type = "CALL";
      if (message.to === undefined) {
        type = message.salt !== undefined ? "CREATE2" : "CREATE";
      } else if (message.delegatecall) {
        type = "DELEGATECALL";
      } else if (message.isStatic) {
        type = "STATICCALL";
      }
      const node = {
        type,
        from: message.caller?.toString() || "",
        to: message.to ? message.to.toString() : null,
        toName: null,
        functionName: null,
        value: (message.value ?? 0n).toString(),
        gas: (message.gasLimit ?? 0n).toString(),
        gasUsed: "0",
        input: bytesToHex(message.data ?? new Uint8Array()),
        output: "0x",
        decodedInputs: null,
        decodedOutputs: null,
        error: null,
        errorReason: null,
        logs: [],
        calls: [],
      };
      if (message.depth === 0) {
        callTraceRoot = node;
        rootGasLimit = message.gasLimit ?? 0n;
      } else if (type !== "STATICCALL") {
        // Attach to parent — STATICCALLs are excluded from the visible tree to
        // keep the trace readable, but are still pushed on the stack below so
        // that depth tracking remains correct for any calls nested inside them.
        const parent = callStack[callStack.length - 1];
        if (parent) parent.calls.push(node);
      }
      callStack.push(node);
      next?.();
    };

    const onAfterMessage = (result, next) => {
      const node = callStack.pop();
      if (!node) {
        next?.();
        return;
      }
      node.gasUsed = (result.execResult?.executionGasUsed ?? 0n).toString();
      if (result.execResult?.returnValue?.length) {
        node.output = bytesToHex(result.execResult.returnValue);
      }
      if (result.createdAddress) {
        node.to = result.createdAddress.toString();
      }
      if (result.execResult?.exceptionError) {
        node.error =
          result.execResult.exceptionError.error ||
          String(result.execResult.exceptionError);
        if (result.execResult.returnValue?.length >= 4) {
          const revertHex = bytesToHex(result.execResult.returnValue);
          // For the root call use the full ABI (includes error defs); sub-calls
          // use abiCache keyed by their target address, falling back to root ABI.
          const nodeAbi =
            node === callTraceRoot
              ? abi
              : (abiCache.get(node.to?.toLowerCase()) ?? abi);
          node.errorReason = decodeRevertData(revertHex, nodeAbi);
        }
      }
      next?.();
    };

    // Intercept LOG opcodes to associate each log with its emitting frame.
    // At the moment onStep fires the opcode hasn't executed yet, so all
    // arguments are still on the stack — same window that geth's OnLog uses.
    // Also handles abort signal and progress reporting.
    //
    // WHY async + setTimeout yield:
    // tevm's EVM runs as a microtask chain. The Cancel button click is a
    // macrotask and cannot interrupt microtasks — so abortSignal.aborted would
    // never be seen mid-simulation without a periodic yield. Every ~50ms we
    // schedule a real macrotask break (setTimeout 0) which lets the browser
    // process the click event and set aborted = true before we resume.
    let lastYieldAt = Date.now();

    const onStep = async (step, next) => {
      // Periodically yield to the macrotask queue so the Cancel button click
      // (a macrotask) can run and set abortSignal.aborted = true.
      const now = Date.now();
      if (now - lastYieldAt >= 50) {
        lastYieldAt = now;
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      // Check abort after the potential yield
      if (abortSignal?.aborted) {
        throw new Error("Simulation cancelled");
      }

      // Progress: use gasLeft at root depth as proxy for work done.
      if (onProgress && rootGasLimit > 0n && step.depth === 0) {
        stepCount++;
        if (stepCount % 100 === 0) {
          const gasConsumed = rootGasLimit - (step.gasLeft ?? 0n);
          const pct = Number((gasConsumed * 95n) / rootGasLimit);
          onProgress(Math.max(1, Math.min(95, pct)));
        }
      }

      const opName = step.opcode?.name;
      if (opName && LOG_OPCODES.has(opName)) {
        const numTopics = parseInt(opName[3]); // 0..4
        const stack = step.stack; // BigInt[], last = top of stack
        const len = stack.length;
        if (len >= 2 + numTopics) {
          const offset = Number(stack[len - 1]);
          const size = Number(stack[len - 2]);
          const topics = [];
          for (let i = 0; i < numTopics; i++) {
            topics.push(
              "0x" + stack[len - 3 - i].toString(16).padStart(64, "0"),
            );
          }
          const mem = step.memory;
          const data =
            size > 0 && mem
              ? bytesToHex(mem.slice(offset, offset + size))
              : "0x";
          const addr =
            step.address?.toString() ||
            callStack[callStack.length - 1]?.to ||
            "";
          const currentFrame = callStack[callStack.length - 1];
          if (currentFrame) {
            currentFrame.logs.push({
              address: addr,
              topics,
              data,
              name: null,
              decoded: false,
              inputs: [],
            });
          }
        }
      }
      next?.();
    };

    const callResult = await client.tevmCall({
      to: address,
      from: sender,
      data: callData,
      value: valueInWei,
      createAccessList: true,
      throwOnFail: false, // return errors in result instead of throwing, so rawData is accessible
      onBeforeMessage,
      onAfterMessage,
      onStep,
    });

    // Check for errors
    const success = !callResult.errors || callResult.errors.length === 0;
    const rawOutput = callResult.rawData || "0x";

    // Decode output if function has outputs and call succeeded
    let decodedOutputs = [];
    if (
      success &&
      functionAbi.outputs &&
      functionAbi.outputs.length > 0 &&
      rawOutput !== "0x"
    ) {
      try {
        const decoded = decodeFunctionResult({
          abi: [functionAbi],
          functionName: functionAbi.name,
          data: rawOutput,
        });

        if (functionAbi.outputs.length === 1) {
          decodedOutputs = [
            {
              name: functionAbi.outputs[0].name || "result",
              type: functionAbi.outputs[0].type,
              value: serializeValue(decoded),
            },
          ];
        } else {
          decodedOutputs = functionAbi.outputs.map((output, index) => ({
            name: output.name || `output${index}`,
            type: output.type,
            value: serializeValue(
              Array.isArray(decoded) ? decoded[index] : decoded[output.name],
            ),
          }));
        }
      } catch (e) {
        console.error("Failed to decode output:", e);
      }
    }

    // Build event ABI map for log decoding
    const eventAbisByAddress = new Map();
    const mainContractEventAbis = abi.filter((item) => item.type === "event");
    eventAbisByAddress.set(address.toLowerCase(), mainContractEventAbis);
    for (const [cachedAddress, cachedAbi] of abiCache) {
      const eventAbis = cachedAbi.filter((item) => item.type === "event");
      if (eventAbis.length > 0)
        eventAbisByAddress.set(cachedAddress.toLowerCase(), eventAbis);
    }

    // Decode logs across the entire call tree in-place.
    // Logs are already attached to their emitting frames via onStep.
    const undecodedAddressesSet = decodeLogsInTree(
      callTraceRoot,
      eventAbisByAddress,
    );
    pruneDecodedAddresses(callTraceRoot, undecodedAddressesSet);
    const undecodedAddresses = undecodedAddressesSet;

    // Flat log list for the Logs tab (same set, just flattened)
    const parsedLogs = flattenLogsFromTree(callTraceRoot);

    // Annotate root frame with decoded function info
    if (callTraceRoot) {
      callTraceRoot.functionName = functionName;
      callTraceRoot.decodedInputs = functionAbi.inputs.map((input, index) => ({
        name: input.name || `input${index}`,
        type: input.type,
        value: serializeValue(parsedArgs[index]),
      }));
      callTraceRoot.decodedOutputs = decodedOutputs;
      if (!success && !callTraceRoot.error) {
        callTraceRoot.error =
          callResult.errors?.[0]?.message || "Transaction reverted";
      }
    }

    // Strip STATICCALL nodes from the tree (defence-in-depth: also handled at render time)
    pruneStaticCalls(callTraceRoot);

    // Decode function names + args for sub-calls using the selector map
    const selectorMap = buildSelectorMap(abi, abiCache);
    decodeSubCallNodes(callTraceRoot, selectorMap);

    // Also track sub-call addresses that couldn't be decoded — their ABIs will
    // be fetched and a second decode pass run by the caller (page.js).
    for (const addr of collectUndecodedCallAddresses(callTraceRoot)) {
      undecodedAddresses.add(addr);
    }

    const callTraceTree = callTraceRoot;

    // Get gas used
    const gasUsed = callResult.executionGasUsed
      ? Number(callResult.executionGasUsed)
      : 0;

    // Access list if available
    const accessList = Array.isArray(callResult.accessList)
      ? callResult.accessList
      : [];

    return {
      success,
      simulated: true,
      localSimulation: true,
      blockNumber: pinnedBlock,
      rawData: rawOutput,
      decoded: decodedOutputs,
      gasUsed,
      assetChanges: [],
      balanceChanges: [],
      logs: parsedLogs,
      callTrace: callTraceTree,
      stateChanges: [],
      accessList: accessList.map((item) => ({
        address: item.address,
        storageKeys: item.storageKeys || [],
      })),
      error: success
        ? null
        : (() => {
            // callTraceRoot.errorReason is set by onAfterMessage via decodeRevertData.
            // Fall back to decoding rawOutput directly in case the hook path was skipped.
            const reason =
              callTraceRoot?.errorReason || decodeRevertData(rawOutput, abi);
            return reason ? `Revert: ${reason}` : "Transaction reverted";
          })(),
      undecodedAddresses: Array.from(undecodedAddresses),
    };
  } catch (error) {
    console.error("Tevm simulation error:", error);

    // Try to extract a human-readable reason from the thrown error.
    // tevm's RevertError embeds the raw return data in error.data?.returnData or error._data.
    let errorMessage = "Failed to simulate transaction";
    const rawRevertData = error?.data?.returnData ?? error?.returnData;
    if (rawRevertData) {
      const hex =
        typeof rawRevertData === "string"
          ? rawRevertData
          : bytesToHex(rawRevertData);
      const reason = decodeRevertData(hex, abi);
      if (reason) errorMessage = `Revert: ${reason}`;
      else errorMessage = "Transaction reverted";
    } else if (error.message && !error.message.includes("https://tevm.sh")) {
      errorMessage = error.message;
    } else if (error.message?.includes("revert")) {
      errorMessage = "Transaction reverted";
    }

    return {
      success: false,
      simulated: true,
      localSimulation: true,
      rawData: "0x",
      decoded: [],
      gasUsed: 0,
      assetChanges: [],
      balanceChanges: [],
      logs: [],
      callTrace: null,
      stateChanges: [],
      error: errorMessage,
      undecodedAddresses: [],
    };
  }
}

/**
 * Simulate a contract call using Tevm
 * @param {Object} params - Simulation parameters
 * @param {Map<string, Array>} params.abiCache - Optional map of lowercase address -> ABI array for decoding logs from multiple contracts
 * @returns {Object} Simulation result including `undecodedAddresses` - addresses that emitted logs but couldn't be decoded
 */
export async function simulateWithTevm(params) {
  const {
    chain,
    rpcUrl,
    blockNumber = "latest",
    customChainId = null,
    rpcBatchSize = 1,
  } = params;
  const { client, blockNumber: actualBlock } = await createTevmClient(
    chain,
    rpcUrl,
    blockNumber,
    customChainId,
    rpcBatchSize,
  );
  return _runSimulationOnClient(client, actualBlock, params);
}

/**
 * Simulate a contract call using an existing tevm client (session mode).
 * The caller is responsible for creating and managing the client lifecycle.
 * @param {object} client - An existing tevm memory client
 * @param {string} pinnedBlock - The block number/tag the client was forked at
 * @param {Object} params - Same simulation parameters as simulateWithTevm (chain/rpcUrl/blockNumber are ignored)
 */
export async function simulateWithClient(client, pinnedBlock, params) {
  if (!client) throw new Error("client is required");
  return _runSimulationOnClient(client, pinnedBlock, params);
}

/**
 * Re-decode logs using an updated ABI cache
 * @param {Array} logs - Array of log objects (some may be undecoded)
 * @param {Map<string, Array>} abiCache - Map of lowercase address -> ABI array
 * @returns {Array} Logs with updated decoding
 */
export function redecodeLogs(logs, abiCache) {
  if (!logs || !Array.isArray(logs)) return logs;
  const eventAbisByAddress = buildEventAbiMap(abiCache);
  return logs.map((log) =>
    log.decoded ? log : tryDecodeLog(log, eventAbisByAddress),
  );
}

/**
 * Re-decode all logs in a call trace tree using a new ABI cache.
 * Call this after fetching ABIs for previously undecoded addresses.
 * Returns a new tree (shallow clone of nodes, logs replaced).
 */
export function redecodeCallTrace(callTrace, abiCache) {
  if (!callTrace) return callTrace;
  const eventAbisByAddress = buildEventAbiMap(abiCache);
  const selectorMap = buildSelectorMap([], abiCache);
  const tree = redecodeTreeNode(callTrace, eventAbisByAddress);
  // Re-run sub-call decoding with the updated selector map so newly fetched
  // ABIs can decode function names/inputs that were null on the first pass.
  decodeSubCallNodes(tree, selectorMap);
  return tree;
}

function buildEventAbiMap(abiCache) {
  const map = new Map();
  for (const [address, abi] of abiCache || new Map()) {
    const eventAbis = (abi || []).filter((item) => item.type === "event");
    if (eventAbis.length > 0) map.set(address.toLowerCase(), eventAbis);
  }
  return map;
}

function redecodeTreeNode(node, eventAbisByAddress) {
  return {
    ...node,
    logs: (node.logs || []).map((log) =>
      log.decoded ? log : tryDecodeLog(log, eventAbisByAddress),
    ),
    calls: (node.calls || []).map((child) =>
      redecodeTreeNode(child, eventAbisByAddress),
    ),
  };
}

/**
 * Helper to check if Tevm is available and working
 */
export async function checkTevmAvailability(
  chain,
  rpcUrl,
  customChainId = null,
) {
  try {
    const { client } = await createTevmClient(
      chain,
      rpcUrl,
      "latest",
      customChainId,
    );
    const blockNumber = await client.getBlockNumber();
    return {
      available: true,
      blockNumber: Number(blockNumber),
    };
  } catch (error) {
    return {
      available: false,
      error: error.message,
    };
  }
}
