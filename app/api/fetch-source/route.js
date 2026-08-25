import { NextResponse } from "next/server";
import { createPublicClient, http, defineChain } from "viem";
import { isValidEthAddress } from "../../utils/validation";
import { VIEM_CHAINS, DEFAULT_RPC_URLS } from "../../utils/chains";
import {
  fetchContractInfoFromEtherscan,
  fetchSourceFromSourcify,
  fetchContractInfoFromRouteScan,
  getDiamondFacetAddresses,
  resolveChainId,
} from "../../utils/fetchContract";

async function fetchSourceForAddress(
  address,
  chainId,
  etherscanApiKey,
  routescanApiKey,
) {
  if (etherscanApiKey) {
    const result = await fetchContractInfoFromEtherscan(
      address,
      chainId,
      etherscanApiKey,
    );
    if (result?.sourceCode)
      return {
        sourceCode: result.sourceCode,
        compilerVersion: result.compilerVersion,
        source: result.source,
      };
  }

  const sourcifyResult = await fetchSourceFromSourcify(address, chainId);
  if (sourcifyResult?.sourceCode)
    return {
      sourceCode: sourcifyResult.sourceCode,
      compilerVersion: sourcifyResult.compilerVersion,
      source: sourcifyResult.source,
    };

  const routescanResult = await fetchContractInfoFromRouteScan(
    address,
    chainId,
    routescanApiKey,
  );
  if (routescanResult?.sourceCode)
    return {
      sourceCode: routescanResult.sourceCode,
      compilerVersion: routescanResult.compilerVersion,
      source: routescanResult.source,
    };

  return null;
}

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

    const chainId = await resolveChainId(chain, searchParams);
    if (!chainId) {
      return NextResponse.json(
        { error: `Unsupported chain: ${chain}` },
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

    let result = await fetchSourceForAddress(
      address,
      chainId,
      etherscanApiKey,
      routescanApiKey,
    );

    // Diamond proxy: discover facets and fetch their source code
    const customRpcUrl = searchParams.get("rpcUrl");
    let configChain = VIEM_CHAINS[chain];
    let rpcUrl = customRpcUrl || DEFAULT_RPC_URLS[chain];
    const customChainIdParam = searchParams.get("chainId");

    if (!configChain && customChainIdParam && customRpcUrl) {
      configChain = defineChain({
        id: chainId,
        name: chain,
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: [customRpcUrl] } },
      });
      rpcUrl = customRpcUrl;
    }

    if (configChain && rpcUrl) {
      const client = createPublicClient({
        chain: configChain,
        transport: http(rpcUrl),
      });
      const facetAddresses = await getDiamondFacetAddresses(client, address);
      if (facetAddresses.length > 0) {
        const facetSources = {};
        let facetCompilerVersion = null;
        for (const facet of facetAddresses) {
          const facetResult = await fetchSourceForAddress(
            facet,
            chainId,
            etherscanApiKey,
            routescanApiKey,
          );
          if (facetResult?.sourceCode) {
            Object.assign(facetSources, facetResult.sourceCode);
            if (!facetCompilerVersion)
              facetCompilerVersion = facetResult.compilerVersion;
          }
        }
        if (Object.keys(facetSources).length > 0) {
          const mergedSources = result?.sourceCode
            ? { ...facetSources, ...result.sourceCode }
            : facetSources;
          return NextResponse.json({
            sourceCode: mergedSources,
            compilerVersion:
              result?.compilerVersion || facetCompilerVersion || null,
            source: "diamond",
          });
        }
      }
    }

    if (result?.sourceCode) {
      return NextResponse.json(result);
    }

    return NextResponse.json(
      { error: "Source code not found" },
      { status: 404 },
    );
  } catch (error) {
    console.error("Fetch source error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch source code" },
      { status: 500 },
    );
  }
}
