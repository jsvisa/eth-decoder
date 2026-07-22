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
  redecodeLogs,
  redecodeCallTrace,
  collectAllCallAddresses,
} from "../../utils/tevmSimulator";
import { isValidEthAddress } from "../../utils/validation";
import {
  saveSimulationResult,
  pruneExpiredResults,
} from "../../utils/simulationCache";
import { buildSimulationLink } from "../../utils/simulationLinks";
import { enrichBalanceChanges } from "../../utils/balanceChanges";
import { autoFillWarpTimestamp } from "../../utils/cheatcodes";
import { fetchCoinGeckoPrice } from "../../utils/coingecko";
import {
  NATIVE_TOKEN_ADDRESS,
  TOKEN_TRANSFER_TOPICS,
  SYMBOL_ABI,
  NAME_ABI,
  DECIMALS_ABI,
} from "../../utils/tokenTransfers";

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
    rpcUrl = null,
    balanceOverrides = [],
    storageOverrides = [],
    cheatcodes = {},
    price = true,
    rpcBatchSize = 20,
    save = false,
  } = body;

  if (!chainId) {
    return NextResponse.json(
      { error: "Missing required field: chainId" },
      { status: 400 },
    );
  }
  if (!to) {
    return NextResponse.json(
      { error: "Missing required field: to" },
      { status: 400 },
    );
  }
  if (!data) {
    return NextResponse.json(
      { error: "Missing required field: data" },
      { status: 400 },
    );
  }
  if (!from) {
    return NextResponse.json(
      { error: "Missing required field: from" },
      { status: 400 },
    );
  }

  if (!isValidEthAddress(to)) {
    return NextResponse.json(
      { error: "Invalid 'to' address format" },
      { status: 400 },
    );
  }

  if (!isValidEthAddress(from)) {
    return NextResponse.json(
      { error: "Invalid 'from' address format" },
      { status: 400 },
    );
  }

  if (gas !== null && gas !== undefined) {
    try {
      BigInt(gas);
    } catch {
      return NextResponse.json(
        { error: "Invalid 'gas' format — must be a decimal or hex integer" },
        { status: 400 },
      );
    }
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

  const numericChainId = Number(chainId);
  const chain = rpcUrl
    ? buildCustomChainConfig(numericChainId, rpcUrl)
    : getChainConfigByChainId(numericChainId);
  if (!chain) {
    return NextResponse.json(
      {
        error: `Unsupported chainId: ${chainId}. Provide an rpcUrl to simulate on a non-builtin chain.`,
      },
      { status: 400 },
    );
  }

  const etherscanKey = apiKeys.etherscan || process.env.ETHERSCAN_API_KEY || "";
  const routescanKey = apiKeys.routescan || process.env.ROUTESCAN_API_KEY || "";

  let abiEntry = await getAbiFromCache(numericChainId, to);
  let functionName = null;
  if (!abiEntry) {
    const fetched = await fetchAbi(to, numericChainId, {
      etherscanKey,
      routescanKey,
      viemChain: chain.viemChain,
      rpcUrl: chain.rpcUrl,
      detectProxy: true,
    });
    if (fetched?.abi) {
      abiEntry = { ...fetched, fetchedAt: Date.now() };
      await setAbiInCache(numericChainId, to, abiEntry);
    }
  }

  const abiCacheMap = new Map();

  if (abiEntry?.abi) {
    try {
      ({ functionName } = decodeFunctionData({
        abi: abiEntry.abi,
        data,
      }));
    } catch {
      functionName = null;
    }
    abiCacheMap.set(to.toLowerCase(), abiEntry.abi);
  }

  let valueStr;
  try {
    valueStr = String(BigInt(value));
  } catch {
    return NextResponse.json(
      { error: "Invalid 'value' format" },
      { status: 400 },
    );
  }

  const resolvedCheatcodes = await autoFillWarpTimestamp(
    blockNumber,
    cheatcodes,
    chain.rpcUrl,
    chain.viemChain,
  );

  pruneExpiredResults().catch(() => {});

  const requestBody = {
    chainId: numericChainId,
    to,
    data,
    from,
    value,
    gas,
    blockNumber,
    rpcUrl,
    functionName,
  };

  try {
    const result = await simulateWithTevm({
      chain: chain.id,
      rpcUrl: chain.forkRpcUrl,
      ...(rpcUrl ? { customChainId: numericChainId } : {}),
      address: to,
      functionName,
      callData: data,
      abi: abiEntry?.abi || null,
      fromAddress: from,
      value: valueStr,
      valueUnit: "Wei",
      gas: gas != null ? String(BigInt(gas)) : null,
      blockNumber:
        blockNumber === "latest" ? "latest" : String(BigInt(blockNumber)),
      abiCache: abiCacheMap,
      balanceOverrides,
      storageOverrides,
      cheatcodes: resolvedCheatcodes,
      rpcBatchSize: Math.max(1, Math.min(100, Number(rpcBatchSize) || 20)),
    });

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
        const client = chain.rpcUrl
          ? createPublicClient({
              chain: chain.viemChain,
              transport: http(chain.rpcUrl),
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
    if (save) {
      const simulationId = await saveSimulationResult(resultWithRequest);
      responseData.simulationId = simulationId;
      responseData.simulationLink = buildSimulationLink(request, simulationId);
    }
    return NextResponse.json(responseData);
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
    return NextResponse.json(responseData, { status: 500 });
  }
}
