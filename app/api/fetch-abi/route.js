import { NextResponse } from "next/server";
import { defineChain } from "viem";
import { isValidEthAddress, isValidHttpUrl } from "../../utils/validation";
import {
  BUILT_IN_CHAIN_IDS,
  VIEM_CHAINS,
  DEFAULT_RPC_URLS,
} from "../../utils/chains";
import { fetchAbi } from "../../utils/fetchContract";

export { fetchAbi };

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get("address");
    const chain = searchParams.get("chain") || "ethereum";

    if (!address) {
      return NextResponse.json(
        { error: "Missing address parameter" },
        { status: 400 },
      );
    }

    if (!isValidEthAddress(address)) {
      return NextResponse.json(
        { error: "Invalid address format" },
        { status: 400 },
      );
    }

    const customRpcUrl = searchParams.get("rpcUrl");
    const customChainIdParam = searchParams.get("chainId");

    // Only allow http(s) URLs for user-supplied RPC endpoints
    if (customRpcUrl && !isValidHttpUrl(customRpcUrl)) {
      return NextResponse.json(
        { error: "Invalid rpcUrl — must be an http:// or https:// URL" },
        { status: 400 },
      );
    }

    let chainId = BUILT_IN_CHAIN_IDS[chain];
    let chainConfig = VIEM_CHAINS[chain];
    let rpcUrl = customRpcUrl || DEFAULT_RPC_URLS[chain];

    if (!chainId && customChainIdParam && customRpcUrl) {
      chainId = parseInt(customChainIdParam, 10);
      chainConfig = defineChain({
        id: chainId,
        name: chain,
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: [customRpcUrl] } },
      });
      rpcUrl = customRpcUrl;
    }

    if (!chainId || !chainConfig || !rpcUrl) {
      return NextResponse.json(
        {
          error: `Unsupported chain: ${chain}. Please configure an RPC URL for this chain.`,
        },
        { status: 400 },
      );
    }

    const etherscanApiKey =
      searchParams.get("etherscanApiKey") ||
      process.env.ETHERSCAN_API_KEY ||
      "";
    const routescanApiKey =
      searchParams.get("routescanApiKey") ||
      process.env.ROUTESCAN_API_KEY ||
      "";
    const detectProxy = searchParams.get("detectProxy") === "true";
    const concurrency = Math.max(
      1,
      parseInt(searchParams.get("concurrency") || "1", 10) || 1,
    );

    const result = await fetchAbi(address, chainId, {
      etherscanKey: etherscanApiKey,
      routescanKey: routescanApiKey,
      viemChain: chainConfig,
      rpcUrl,
      detectProxy,
      concurrency,
    });

    if (!result || !result.abi) {
      return NextResponse.json(
        { error: "Failed to fetch ABI. Contract may not be verified." },
        { status: 400 },
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Fetch ABI error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch ABI" },
      { status: 500 },
    );
  }
}
