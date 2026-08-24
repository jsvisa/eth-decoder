import { NextResponse } from "next/server";
import { decodeFunctionData, createPublicClient, http } from "viem";
import {
  getChainConfigByChainId,
  buildCustomChainConfig,
} from "../../utils/chains";
import { fetchAbi } from "../fetch-abi/route";
import { getAbiFromCache, setAbiInCache } from "../../utils/serverAbiBlobCache";
import {
  simulateWithTevm,
  simulateWithClient,
  createTevmClient,
  redecodeLogs,
  redecodeCallTrace,
  collectAllCallAddresses,
} from "../../utils/tevmSimulator";
import { isValidEthAddress, isValidHttpUrl } from "../../utils/validation";
import { getProRpcUrl } from "../../utils/proKeys";
import {
  saveSimulationResult,
  pruneExpiredResults,
} from "../../utils/simulationCache";
import { buildSimulationLink } from "../../utils/simulationLinks";
import { enrichBalanceChanges } from "../../utils/balanceChanges";
import { serializeBigInts } from "../../contract-caller/utils/functionArgs";
import { autoFillWarpTimestamp } from "../../utils/cheatcodes";
import { fetchCoinGeckoPrice } from "../../utils/coingecko";
import {
  NATIVE_TOKEN_ADDRESS,
  TOKEN_TRANSFER_TOPICS,
  SYMBOL_ABI,
  NAME_ABI,
  DECIMALS_ABI,
} from "../../utils/tokenTransfers";

function isCreateCall(call) {
  return call.to === undefined || call.to === null;
}

/**
 * Validate the per-call fields shared by single-call and session modes.
 * Returns { error } on failure, or { error: null }.
 */
function validateCallFields(call) {
  if (!call || typeof call !== "object") {
    return { error: "Each entry in 'calls' must be an object" };
  }
  if (!call.data) {
    return { error: "Missing required field: data" };
  }
  if (!call.from) {
    return { error: "Missing required field: from" };
  }
  if (!/^0x[0-9a-fA-F]*$/.test(String(call.data).trim())) {
    return { error: "Invalid 'data' — must be a 0x-prefixed hex string" };
  }
  if (!isCreateCall(call) && !isValidEthAddress(call.to)) {
    return { error: "Invalid 'to' address format" };
  }
  if (!isValidEthAddress(call.from)) {
    return { error: "Invalid 'from' address format" };
  }
  if (call.gas !== null && call.gas !== undefined) {
    try {
      BigInt(call.gas);
    } catch {
      return {
        error: "Invalid 'gas' format — must be a decimal or hex integer",
      };
    }
  }
  try {
    String(BigInt(call.value ?? "0x0"));
  } catch {
    return { error: "Invalid 'value' format" };
  }
  return { error: null };
}

/**
 * Merge a session call entry with session-level defaults. Per-call overrides
 * win; omitted per-call fields fall back to the top-level values.
 */
function mergeCallDefaults(call, defaults) {
  return {
    ...defaults,
    ...call,
    balanceOverrides: call.balanceOverrides ?? defaults.balanceOverrides,
    storageOverrides: call.storageOverrides ?? defaults.storageOverrides,
    cheatcodes: call.cheatcodes ?? defaults.cheatcodes,
  };
}

/**
 * Simulate a single transaction. Used for both the top-level single-call body
 * and each entry in a session-mode `calls` array. In session mode, pass an
 * existing `sessionClient` + `pinnedBlock` so each call runs on (and, on
 * success, commits to) the shared tevm client. `abiEntryCache` and
 * `abiCacheMap` are shared across session calls so ABIs are fetched once.
 *
 * Returns { status, body } where body is the JSON response payload.
 */
async function runSingleSimulation({
  request,
  chain,
  numericChainId,
  etherscanKey,
  routescanKey,
  call,
  abiEntryCache,
  abiCacheMap,
  sessionClient = null,
  pinnedBlock = null,
  customChainId = null,
  rpcUrl = null,
  rpcBatchSize = 20,
  price = true,
  save = false,
  includeMetrics = false,
}) {
  const {
    to,
    data,
    from,
    value,
    gas,
    blockNumber,
    balanceOverrides,
    storageOverrides,
    cheatcodes,
  } = call;
  const isCreate = isCreateCall(call);

  let valueStr;
  try {
    valueStr = String(BigInt(value ?? "0x0"));
  } catch {
    return { status: 400, body: { error: "Invalid 'value' format" } };
  }

  let abiEntry = null;
  let toKey = null;
  if (!isCreate) {
    toKey = to.toLowerCase();
    abiEntry = abiEntryCache.get(toKey);
    if (!abiEntry) {
      abiEntry = await getAbiFromCache(numericChainId, to);
      if (!abiEntry) {
        const fetched = await fetchAbi(to, numericChainId, {
          etherscanKey,
          routescanKey,
          viemChain: chain.viemChain,
          rpcUrl: chain.rpcUrl,
          detectProxy: true,
          concurrency: 1,
        });
        if (fetched?.abi) {
          abiEntry = { ...fetched, fetchedAt: Date.now() };
          await setAbiInCache(numericChainId, to, abiEntry);
        }
      }
      abiEntryCache.set(toKey, abiEntry || null);
    }
  }

  let functionName = null;
  let decodedArgs = null;
  if (abiEntry?.abi) {
    try {
      ({ functionName, args: decodedArgs } = decodeFunctionData({
        abi: abiEntry.abi,
        data,
      }));
    } catch {
      functionName = null;
    }
    abiCacheMap.set(toKey, abiEntry.abi);
  }

  const resolvedCheatcodes = await autoFillWarpTimestamp(
    blockNumber,
    cheatcodes,
    chain.rpcUrl,
    chain.viemChain,
  );

  const requestBody = {
    chainId: numericChainId,
    to: isCreate ? null : to,
    data,
    from,
    value: value ?? "0x0",
    gas: gas ?? null,
    blockNumber,
    rpcUrl,
    functionName,
    args: serializeBigInts(decodedArgs),
  };

  const normalizedBatchSize = Math.max(
    1,
    Math.min(100, Number(rpcBatchSize) || 20),
  );

  try {
    const simParams = {
      chain: chain.id,
      rpcUrl: chain.forkRpcUrl,
      ...(customChainId ? { customChainId } : {}),
      isCreate,
      address: isCreate ? null : to,
      functionName,
      args: decodedArgs,
      callData: data,
      abi: abiEntry?.abi || null,
      fromAddress: from,
      value: valueStr,
      valueUnit: "Wei",
      gas: gas != null ? String(BigInt(gas)) : null,
      abiCache: abiCacheMap,
      balanceOverrides,
      storageOverrides,
      cheatcodes: resolvedCheatcodes,
      rpcBatchSize: normalizedBatchSize,
    };

    let result;
    if (sessionClient) {
      result = await simulateWithClient(sessionClient, pinnedBlock, {
        ...simParams,
        persistState: true,
      });
    } else {
      result = await simulateWithTevm({
        ...simParams,
        blockNumber:
          blockNumber === "latest" ? "latest" : String(BigInt(blockNumber)),
      });
    }

    // Collect all addresses needing ABIs, fetch uncached ones in parallel, re-decode
    const neededAddrs = new Set(
      result.undecodedAddresses?.map((a) => a.toLowerCase()),
    );
    if (result.callTrace) {
      for (const addr of collectAllCallAddresses(result.callTrace)) {
        neededAddrs.add(addr.toLowerCase());
      }
    }
    if (neededAddrs.size > 0) {
      const extraAbis = new Map();
      const toFetch = [];
      for (const addr of neededAddrs) {
        if (abiCacheMap.has(addr)) continue;
        const cached = await getAbiFromCache(numericChainId, addr);
        if (cached?.abi) {
          extraAbis.set(addr, cached.abi);
        } else {
          toFetch.push(addr);
        }
      }
      if (toFetch.length > 0) {
        await Promise.all(
          toFetch.map(async (addr) => {
            try {
              const fetched = await fetchAbi(addr, numericChainId, {
                etherscanKey,
                routescanKey,
                viemChain: chain.viemChain,
                rpcUrl: chain.rpcUrl,
                detectProxy: true,
                concurrency: 1,
              });
              if (fetched?.abi) {
                extraAbis.set(addr, fetched.abi);
                setAbiInCache(numericChainId, addr, {
                  ...fetched,
                  fetchedAt: Date.now(),
                }).catch(() => {});
              }
            } catch {
              // ABI fetch failed
            }
          }),
        );
      }
      if (extraAbis.size > 0) {
        for (const [addr, abi] of extraAbis) {
          abiCacheMap.set(addr, abi);
        }
        result.logs = redecodeLogs(result.logs || [], abiCacheMap);
        if (result.callTrace) {
          result.callTrace = redecodeCallTrace(result.callTrace, abiCacheMap);
        }
      }
    }

    let enrichedResult = result;
    if (price && price !== "false" && result.balanceChanges?.length) {
      try {
        const metadataRpcUrl = chain.forkRpcUrl || chain.rpcUrl;
        const client = metadataRpcUrl
          ? createPublicClient({
              chain: chain.viemChain,
              transport: http(metadataRpcUrl),
            })
          : null;

        const tokenAddresses = new Set();
        for (const log of result.logs || []) {
          if (
            log.address &&
            log.topics?.[0] &&
            TOKEN_TRANSFER_TOPICS.has(log.topics[0]) &&
            isValidEthAddress(log.address)
          ) {
            tokenAddresses.add(log.address.toLowerCase());
          }
        }

        const tokenSymbols = {};
        const tokenDecimals = {};
        const tokenPrices = {};

        const fetchTokenMeta = async (addr) => {
          if (addr !== NATIVE_TOKEN_ADDRESS && client) {
            let symbol;
            try {
              symbol = await client.readContract({
                address: addr,
                abi: SYMBOL_ABI,
                functionName: "symbol",
              });
            } catch {
              try {
                symbol = await client.readContract({
                  address: addr,
                  abi: NAME_ABI,
                  functionName: "name",
                });
              } catch {
                // Both symbol and name failed
              }
            }
            if (symbol !== undefined) tokenSymbols[addr] = symbol;

            try {
              const decimals = await client.readContract({
                address: addr,
                abi: DECIMALS_ABI,
                functionName: "decimals",
              });
              tokenDecimals[addr] = Number(decimals);
            } catch {
              // Decimals fetch failed, skip
            }
          }

          tokenPrices[addr] = await fetchCoinGeckoPrice(addr, numericChainId);
        };

        await Promise.all(
          [...tokenAddresses, NATIVE_TOKEN_ADDRESS].map(fetchTokenMeta),
        );

        const enriched = enrichBalanceChanges({
          logs: result.logs,
          balanceChanges: result.balanceChanges,
          tokenSymbols,
          tokenDecimals,
          tokenPrices,
          nativeTokenSymbol: chain.viemChain?.nativeCurrency?.symbol || "ETH",
        });

        enrichedResult = {
          ...result,
          balanceChanges: enriched,
          _tokenMeta: { tokenSymbols, tokenDecimals, tokenPrices },
        };
      } catch {
        // Enrichment failed — return raw result
      }
    }

    const resultWithRequest = { ...enrichedResult, requestBody };
    let responseData = { ...enrichedResult, requestBody };
    if (includeMetrics !== true) {
      delete responseData.metrics;
    }
    if (save) {
      const simulationId = await saveSimulationResult(resultWithRequest);
      responseData.simulationId = simulationId;
      responseData.simulationLink = buildSimulationLink(request, simulationId);
    }
    return { status: 200, body: responseData };
  } catch (error) {
    const errorResult = {
      success: false,
      error: error.message || "Simulation failed",
      requestBody,
    };
    let responseData = { ...errorResult };
    if (save) {
      const simulationId = await saveSimulationResult(errorResult);
      responseData.simulationId = simulationId;
      responseData.simulationLink = buildSimulationLink(request, simulationId);
    }
    return { status: 500, body: responseData };
  }
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    chainId,
    to,
    data,
    from,
    value = "0x0",
    gas = null,
    blockNumber = "latest",
    apiKeys = {},
    proApiKey,
    rpcUrl = null,
    balanceOverrides = [],
    storageOverrides = [],
    cheatcodes = {},
    price = true,
    rpcBatchSize = 20,
    save = false,
    includeMetrics = false,
    calls,
  } = body;

  const proApiKey = request.headers.get("x-pro-key") || body.proApiKey;

  if (!chainId) {
    return NextResponse.json(
      { error: "Missing required field: chainId" },
      { status: 400 },
    );
  }

  const sessionMode = Array.isArray(calls);
  if (calls !== undefined && !sessionMode) {
    return NextResponse.json(
      { error: "'calls' must be an array" },
      { status: 400 },
    );
  }
  if (sessionMode && calls.length === 0) {
    return NextResponse.json(
      { error: "'calls' must contain at least one entry" },
      { status: 400 },
    );
  }

  if (blockNumber !== "latest") {
    if (!/^(0x[0-9a-fA-F]+|\d+)$/.test(String(blockNumber).trim())) {
      return NextResponse.json(
        {
          error:
            "Invalid 'blockNumber' — must be 'latest', a decimal integer, or a hex string",
        },
        { status: 400 },
      );
    }
  }

  // Only allow http(s) URLs for user-supplied RPC endpoints
  if (rpcUrl && !isValidHttpUrl(rpcUrl)) {
    return NextResponse.json(
      { error: "Invalid rpcUrl — must be an http:// or https:// URL" },
      { status: 400 },
    );
  }

  const numericChainId = Number(chainId);

  const proRpcUrl = rpcUrl ? null : getProRpcUrl(proApiKey, numericChainId);

  let chain = rpcUrl
    ? buildCustomChainConfig(numericChainId, rpcUrl)
    : getChainConfigByChainId(numericChainId);
  if (!chain) {
    if (proRpcUrl) {
      chain = buildCustomChainConfig(numericChainId, proRpcUrl);
    } else {
      return NextResponse.json(
        {
          error: `Unsupported chainId: ${chainId}. Provide an rpcUrl to simulate on a non-builtin chain.`,
        },
        { status: 400 },
      );
    }
  } else if (proRpcUrl) {
    chain = { ...chain, forkRpcUrl: proRpcUrl };
  }

  const etherscanKey = apiKeys.etherscan || process.env.ETHERSCAN_API_KEY || "";
  const routescanKey = apiKeys.routescan || process.env.ROUTESCAN_API_KEY || "";

  pruneExpiredResults().catch(() => {});

  const abiCacheMap = new Map();
  const abiEntryCache = new Map();
  const isBuiltInChain = !!getChainConfigByChainId(numericChainId);
  const customChainId =
    rpcUrl || (proRpcUrl && !isBuiltInChain) ? numericChainId : null;

  const singleCallContext = {
    request,
    chain,
    numericChainId,
    etherscanKey,
    routescanKey,
    rpcUrl: rpcUrl || (proRpcUrl && !isBuiltInChain ? proRpcUrl : null),
    abiEntryCache,
    abiCacheMap,
    customChainId,
    rpcBatchSize,
    price,
    save,
    includeMetrics,
  };

  if (sessionMode) {
    // Validate every call before starting the session
    for (const rawCall of calls) {
      const merged = mergeCallDefaults(rawCall, {
        balanceOverrides,
        storageOverrides,
        cheatcodes,
      });
      const { error } = validateCallFields(merged);
      if (error) {
        return NextResponse.json({ error }, { status: 400 });
      }
    }

    let client;
    let pinnedBlock;
    try {
      const created = await createTevmClient(
        chain.id,
        chain.forkRpcUrl,
        blockNumber === "latest" ? "latest" : String(BigInt(blockNumber)),
        customChainId,
        Math.max(1, Math.min(100, Number(rpcBatchSize) || 20)),
      );
      client = created.client;
      pinnedBlock = created.blockNumber;
    } catch (error) {
      return NextResponse.json(
        {
          success: false,
          error: error.message || "Failed to start simulation session",
        },
        { status: 500 },
      );
    }

    const results = [];
    for (const rawCall of calls) {
      const merged = mergeCallDefaults(rawCall, {
        balanceOverrides,
        storageOverrides,
        cheatcodes,
      });
      const { body: resultBody } = await runSingleSimulation({
        ...singleCallContext,
        save: false,
        call: { ...merged, blockNumber },
        sessionClient: client,
        pinnedBlock,
      });
      results.push(resultBody);
    }

    const sessionResponse = {
      session: true,
      chainId: numericChainId,
      blockNumber,
      results,
    };

    if (save) {
      try {
        const simulationId = await saveSimulationResult(sessionResponse);
        sessionResponse.simulationId = simulationId;
        sessionResponse.simulationLink = buildSimulationLink(
          request,
          simulationId,
        );
      } catch (error) {
        // Session save failed — return the session without a simulation id
      }
    }

    return NextResponse.json(sessionResponse);
  }

  const { error } = validateCallFields({ to, data, from, value, gas });
  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }

  const { status, body: resultBody } = await runSingleSimulation({
    ...singleCallContext,
    call: {
      to,
      data,
      from,
      value,
      gas,
      blockNumber,
      balanceOverrides,
      storageOverrides,
      cheatcodes,
    },
  });

  return NextResponse.json(resultBody, { status });
}
