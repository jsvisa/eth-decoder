import { NextResponse } from "next/server";
import { createPublicClient, http, defineChain } from "viem";
import { isValidEthAddress } from "../../utils/validation";
import { isSafeRpcUrl } from "../../utils/ssrfGuard";
import { VIEM_CHAINS, DEFAULT_RPC_URLS } from "../../utils/chains";
import {
  fetchContractInfoFromEtherscan,
  fetchSourceFromSourcify,
  fetchContractInfoFromRouteScan,
  getDiamondFacetAddresses,
  getImplementationAddress,
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
        isProxy: result.isProxy,
        implementation: result.implementation,
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
      isProxy: routescanResult.isProxy,
      implementation: routescanResult.implementation,
    };

  return null;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      address,
      chain: rawChain,
      rpcUrl: customRpcUrl,
      chainId: customChainIdParam,
      etherscanApiKey: reqEtherscanKey,
      routescanApiKey: reqRoutescanKey,
    } = body;
    const chain = rawChain || "ethereum";

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

    // Only allow http(s) URLs for user-supplied RPC endpoints and reject
    // hosts that point at loopback/private networks (SSRF guard)
    if (customRpcUrl && !(await isSafeRpcUrl(customRpcUrl))) {
      return NextResponse.json(
        { error: "Invalid rpcUrl — must be a public http:// or https:// URL" },
        { status: 400 },
      );
    }

    const chainParams = new URLSearchParams();
    if (customChainIdParam) chainParams.set("chainId", customChainIdParam);
    const chainId = await resolveChainId(chain, chainParams);
    if (!chainId) {
      return NextResponse.json(
        { error: `Unsupported chain: ${chain}` },
        { status: 400 },
      );
    }

    const etherscanApiKey =
      reqEtherscanKey || process.env.ETHERSCAN_API_KEY || "";
    const routescanApiKey =
      reqRoutescanKey || process.env.ROUTESCAN_API_KEY || "";

    let result = await fetchSourceForAddress(
      address,
      chainId,
      etherscanApiKey,
      routescanApiKey,
    );

    // Diamond proxy: discover facets and fetch their source code
    let configChain = VIEM_CHAINS[chain];
    let rpcUrl = customRpcUrl || DEFAULT_RPC_URLS[chain];

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

    // Regular proxy: when Etherscan or Routescan reports this as a proxy,
    // fetch the implementation's source code and merge it in.
    if (result?.isProxy && result?.implementation && configChain && rpcUrl) {
      const client = createPublicClient({
        chain: configChain,
        transport: http(rpcUrl),
      });

      let implAddress = null;
      if (result?.implementation && result?.isProxy) {
        implAddress = result.implementation;
      } else {
        implAddress = await getImplementationAddress(client, address);
      }

      if (implAddress) {
        const implResult = await fetchSourceForAddress(
          implAddress,
          chainId,
          etherscanApiKey,
          routescanApiKey,
        );
        if (implResult?.sourceCode) {
          const mergedSources = result?.sourceCode
            ? { ...result.sourceCode, ...implResult.sourceCode }
            : implResult.sourceCode;
          return NextResponse.json({
            sourceCode: mergedSources,
            compilerVersion:
              implResult.compilerVersion || result?.compilerVersion,
            source: "proxy",
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
