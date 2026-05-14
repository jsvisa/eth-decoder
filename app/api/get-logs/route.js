import { NextResponse } from "next/server";
import { isValidEthAddress } from "../../utils/validation";

const ETHERSCAN_V2_API = "https://api.etherscan.io/v2/api";

const BUILT_IN_CHAIN_IDS = {
  ethereum: 1,
  arbitrum: 42161,
  base: 8453,
  polygon: 137,
  bsc: 56,
};

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");
  const chain = searchParams.get("chain") || "ethereum";
  const topic0 = searchParams.get("topic0");
  const fromBlock = searchParams.get("fromBlock") || "0";
  const toBlock = searchParams.get("toBlock") || "latest";
  const page = searchParams.get("page") || "1";
  const offset = searchParams.get("offset") || "1000";
  const apiKey = searchParams.get("apiKey") || process.env.ETHERSCAN_API_KEY;
  const customChainId = searchParams.get("chainId");

  if (!address || !isValidEthAddress(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const chainId = customChainId || BUILT_IN_CHAIN_IDS[chain];
  if (!chainId) {
    return NextResponse.json({ error: "Unsupported chain" }, { status: 400 });
  }

  if (!apiKey) {
    return NextResponse.json({ error: "API key required" }, { status: 400 });
  }

  const params = new URLSearchParams({
    chainid: chainId,
    module: "logs",
    action: "getLogs",
    address: address,
    fromBlock: fromBlock,
    toBlock: toBlock,
    page: page,
    offset: Math.min(parseInt(offset), 1000).toString(),
    apikey: apiKey,
  });

  if (topic0) {
    params.set("topic0", topic0);
  }

  try {
    const response = await fetch(`${ETHERSCAN_V2_API}?${params}`);
    const data = await response.json();

    if (data.status !== "1" && data.message !== "No records found") {
      return NextResponse.json(
        { error: data.message || "API error" },
        { status: 400 },
      );
    }

    return NextResponse.json({
      result: data.result || [],
      status: data.status,
      message: data.message,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch logs" },
      { status: 500 },
    );
  }
}
