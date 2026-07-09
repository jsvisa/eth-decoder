import { NextResponse } from "next/server";
import {
  decodeFunctionData,
  defineChain,
  createPublicClient,
  http,
} from "viem";
import {
  getChainConfigByChainId,
  CGC_CHAIN_SLUGS,
  ETH_NATIVE_CHAIN_IDS,
} from "../../utils/chains";
import { fetchAbi } from "../fetch-abi/route";
import { getAbiFromCache, setAbiInCache } from "../../utils/serverAbiCache";
import {
  simulateWithTevm,
  redecodeLogs,
  redecodeCallTrace,
} from "../../utils/tevmSimulator";
import { isValidEthAddress } from "../../utils/validation";
import {
  saveSimulationResult,
  pruneExpiredResults,
} from "../../utils/simulationCache";
import { buildSimulationLink } from "../../utils/simulationLinks";
import { enrichBalanceChanges } from "../../utils/balanceChanges";
import {
  TRANSFER_TOPIC,
  ERC20_TRANSFER_TOPIC,
  DEPOSIT_TOPIC,
  WITHDRAWAL_TOPIC,
} from "../../utils/tokenTransfers";

const NATIVE_TOKEN = "0x0000000000000000000000000000000000000000";

const TOKEN_TRANSFER_TOPICS = new Set([
  TRANSFER_TOPIC,
  ERC20_TRANSFER_TOPIC,
  DEPOSIT_TOPIC,
  WITHDRAWAL_TOPIC,
]);

const NATIVE_COIN_IDS = {
  56: "binancecoin",
  137: "matic-network",
};

const SYMBOL_ABI = [
  {
    type: "function",
    name: "symbol",
    inputs: [],
    outputs: [{ type: "string" }],
    stateMutability: "view",
  },
];
const NAME_ABI = [
  {
    type: "function",
    name: "name",
    inputs: [],
    outputs: [{ type: "string" }],
    stateMutability: "view",
  },
];
const DECIMALS_ABI = [
  {
    type: "function",
    name: "decimals",
    inputs: [],
    outputs: [{ type: "uint8" }],
    stateMutability: "view",
  },
];

function buildChainConfig(numericChainId, rpcUrl) {
  return {
    id: `chain-${numericChainId}`,
    rpcUrl,
    forkRpcUrl: rpcUrl,
    viemChain: defineChain({
      id: numericChainId,
      name: `chain-${numericChainId}`,
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [rpcUrl] } },
    }),
  };
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
    rpcUrl = null,
    balanceOverrides = [],
    storageOverrides = [],
    cheatcodes = {},
    price = true,
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
    ? buildChainConfig(numericChainId, rpcUrl)
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
  if (!abiEntry) {
    const fetched = await fetchAbi(to, numericChainId, {
      etherscanKey,
      routescanKey,
      viemChain: chain.viemChain,
      rpcUrl: chain.rpcUrl,
      detectProxy: true,
    });
    if (!fetched || !fetched.abi) {
      return NextResponse.json(
        { error: "ABI not found. Contract may not be verified." },
        { status: 422 },
      );
    }
    abiEntry = { ...fetched, fetchedAt: Date.now() };
    await setAbiInCache(numericChainId, to, abiEntry);
  }

  let functionName;
  try {
    ({ functionName } = decodeFunctionData({
      abi: abiEntry.abi,
      data,
    }));
  } catch (e) {
    return NextResponse.json(
      { error: `Failed to decode calldata: ${e.message}` },
      { status: 422 },
    );
  }

  const abiCacheMap = new Map([[to.toLowerCase(), abiEntry.abi]]);

  let valueStr;
  try {
    valueStr = String(BigInt(value));
  } catch {
    return NextResponse.json(
      { error: "Invalid 'value' format" },
      { status: 400 },
    );
  }

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
      abi: abiEntry.abi,
      fromAddress: from,
      value: valueStr,
      valueUnit: "Wei",
      gas: gas != null ? String(BigInt(gas)) : null,
      blockNumber:
        blockNumber === "latest" ? "latest" : String(BigInt(blockNumber)),
      abiCache: abiCacheMap,
      balanceOverrides,
      storageOverrides,
      cheatcodes,
    });

    // Fetch ABIs for undecoded event-emitting contracts and re-decode logs
    if (result.undecodedAddresses?.length > 0) {
      const extraAbis = new Map();
      for (const addr of result.undecodedAddresses) {
        try {
          const fetched = await fetchAbi(addr, numericChainId, {
            etherscanKey,
            routescanKey,
            viemChain: chain.viemChain,
            rpcUrl: chain.rpcUrl,
            detectProxy: true,
          });
          if (fetched?.abi) {
            extraAbis.set(addr.toLowerCase(), fetched.abi);
          }
        } catch {
          // ABI fetch failed, event stays undecoded
        }
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
        const chainSlug = CGC_CHAIN_SLUGS[numericChainId];

        const fetchTokenMeta = async (addr) => {
          if (addr !== NATIVE_TOKEN && client) {
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

          let priceUrl;
          if (addr === NATIVE_TOKEN) {
            const cgcId = ETH_NATIVE_CHAIN_IDS.has(numericChainId)
              ? "ethereum"
              : NATIVE_COIN_IDS[numericChainId];
            if (cgcId) {
              priceUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${cgcId}&vs_currencies=usd`;
              try {
                const res = await fetch(priceUrl, {
                  signal: AbortSignal.timeout(5000),
                });
                if (res.ok) {
                  const data = await res.json();
                  tokenPrices[addr] = data[cgcId]?.usd ?? null;
                }
              } catch {
                // Price fetch failed, skip
              }
            }
          } else if (chainSlug) {
            priceUrl = `https://api.coingecko.com/api/v3/simple/token_price/${chainSlug}?contract_addresses=${addr}&vs_currencies=usd`;
            try {
              const res = await fetch(priceUrl, {
                signal: AbortSignal.timeout(5000),
              });
              if (res.ok) {
                const data = await res.json();
                tokenPrices[addr] = data[addr]?.usd ?? null;
              }
            } catch {
              // Price fetch failed, skip
            }
          }
        };

        await Promise.all(
          [...tokenAddresses, NATIVE_TOKEN].map(fetchTokenMeta),
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
    const simulationId = await saveSimulationResult(resultWithRequest);
    return NextResponse.json({
      ...enrichedResult,
      simulationId,
      simulationLink: buildSimulationLink(request, simulationId),
      requestBody,
    });
  } catch (error) {
    const errorResult = {
      success: false,
      error: error.message || "Simulation failed",
      requestBody,
    };
    const simulationId = await saveSimulationResult(errorResult);
    return NextResponse.json(
      {
        ...errorResult,
        simulationId,
        simulationLink: buildSimulationLink(request, simulationId),
      },
      { status: 500 },
    );
  }
}
