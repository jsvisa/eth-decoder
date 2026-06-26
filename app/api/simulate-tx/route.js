import { NextResponse } from "next/server";
import { decodeFunctionData } from "viem";
import { BUILT_IN_CHAIN_IDS, getChainConfig } from "../../utils/chains";
import { fetchAbi } from "../fetch-abi/route";
import { getAbiFromCache, setAbiInCache } from "../../utils/serverAbiCache";
import { simulateWithTevm } from "../../utils/tevmSimulator";
import { isValidEthAddress } from "../../utils/validation";

function resolveChain(numericId) {
  const slug = Object.keys(BUILT_IN_CHAIN_IDS).find(
    (s) => BUILT_IN_CHAIN_IDS[s] === numericId,
  );
  return slug ? getChainConfig(slug) : null;
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
    blockNumber = "latest",
    apiKeys = {},
    rpcUrl = null,
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

  const numericChainId = Number(chainId);
  const chain = resolveChain(numericChainId);
  if (!chain) {
    return NextResponse.json(
      { error: `Unsupported chainId: ${chainId}` },
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
    try {
      await setAbiInCache(numericChainId, to, abiEntry);
    } catch {
      // Cache write failure is non-fatal; simulation can proceed without it
    }
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

  try {
    const result = await simulateWithTevm({
      chain: chain.id,
      rpcUrl: rpcUrl || chain.forkRpcUrl,
      address: to,
      functionName,
      callData: data,
      abi: abiEntry.abi,
      fromAddress: from,
      value: valueStr,
      valueUnit: "Wei",
      blockNumber,
      abiCache: abiCacheMap,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Simulation failed" },
      { status: 500 },
    );
  }
}
