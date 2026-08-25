import { NextResponse } from "next/server";
import {
  createPublicClient,
  http,
  defineChain,
  decodeAbiParameters,
  getAddress,
  keccak256,
  toHex,
} from "viem";
import { isValidEthAddress } from "../../utils/validation";
import {
  BUILT_IN_CHAIN_IDS as CHAINS,
  VIEM_CHAINS,
  DEFAULT_RPC_URLS,
} from "../../utils/chains";

import {
  ETHERSCAN_V2_API,
  ROUTESCAN_API_BASE,
  pickApiKey,
  parseEtherscanSourceCode,
} from "../../utils/etherscan";

// EIP-2535 DiamondLoupe facetAddresses() selector
const DIAMOND_FACET_ADDRESSES_SELECTOR = "0x52ef6b2c";

// EIP-2535 DiamondStorage struct layout (0-indexed):
//   0: selectorToFacetAndPosition (mapping)
//   1: facetFunctionSelectors (mapping)
//   2: facetAddresses (address[])
//   3: supportedInterfaces (mapping)
//   4: contractOwner (address)
const DIAMOND_STORAGE_SLOT = keccak256(
  toHex("diamond.standard.diamond.storage"),
);

async function fetchFromEtherscan(address, chainId, apiKey) {
  const key = pickApiKey(apiKey);
  if (!key) return null;

  const params = new URLSearchParams({
    chainid: chainId,
    module: "contract",
    action: "getsourcecode",
    address: address,
    apikey: key,
  });

  const response = await fetch(`${ETHERSCAN_V2_API}?${params}`);
  if (!response.ok) return null;

  const data = await response.json();
  if (data.status !== "1" || !data.result || !data.result[0]) return null;

  const result = data.result[0];
  const sourceCode = parseEtherscanSourceCode(result.SourceCode);
  return {
    sourceCode,
    compilerVersion: result.CompilerVersion || null,
    source: "etherscan",
  };
}

async function fetchFromSourcify(address, chainId) {
  try {
    const response = await fetch(
      `https://sourcify.dev/server/v2/contract/${chainId}/${address}?fields=sources,metadata`,
    );
    if (!response.ok) return null;

    const data = await response.json();
    const sources = data.sources
      ? Object.fromEntries(
          Object.entries(data.sources).map(([file, info]) => [
            file,
            typeof info === "object" ? info.content || "" : info,
          ]),
        )
      : null;

    return {
      sourceCode: sources,
      compilerVersion: data.metadata?.compiler?.version || null,
      source: "sourcify",
    };
  } catch {
    return null;
  }
}

async function fetchFromRouteScan(address, chainId, apiKey) {
  const key = pickApiKey(apiKey);
  const params = new URLSearchParams({
    module: "contract",
    action: "getsourcecode",
    address: address,
  });
  if (key) params.set("apikey", key);

  const url = `${ROUTESCAN_API_BASE}/${chainId}/etherscan/api?${params}`;
  const response = await fetch(url);
  if (!response.ok) return null;

  const data = await response.json();
  if (data.status !== "1" || !data.result || !data.result[0]) return null;

  const result = data.result[0];
  const sourceCode = parseEtherscanSourceCode(result.SourceCode);
  return {
    sourceCode,
    compilerVersion: result.CompilerVersion || null,
    source: "routescan",
  };
}

async function resolveChainId(chain, searchParams) {
  let id = CHAINS[chain];
  if (id) return id;

  id = parseInt(chain, 10);
  if (Number.isFinite(id)) return id;

  const customChainIdParam = searchParams.get("chainId");
  if (customChainIdParam) {
    id = parseInt(customChainIdParam, 10);
    if (Number.isFinite(id)) return id;
  }

  if (chain.startsWith("chain-")) {
    id = parseInt(chain.slice(6), 10);
    if (Number.isFinite(id)) return id;
  }

  return null;
}

async function getDiamondFacetAddresses(client, diamondAddress) {
  const arrSlot = BigInt(DIAMOND_STORAGE_SLOT) + 2n;

  let length;
  try {
    const lengthData = await client.getStorageAt({
      address: diamondAddress,
      slot: toHex(arrSlot, { size: 32 }),
    });
    length = parseInt(lengthData || "0x0", 16);
  } catch {
    return [];
  }
  if (!length || length > 200) return [];

  try {
    const res = await client.call({
      address: diamondAddress,
      data: DIAMOND_FACET_ADDRESSES_SELECTOR,
    });
    if (res.data && res.data.length > 2) {
      const [addresses] = decodeAbiParameters(
        [{ type: "address[]" }],
        res.data,
      );
      if (addresses.length > 0) {
        return addresses.map(getAddress);
      }
    }
  } catch {
    // fall through to storage reading
  }

  try {
    const elementBase = BigInt(keccak256(toHex(arrSlot, { size: 32 })));
    const addresses = [];
    for (let i = 0; i < length; i++) {
      const elementData = await client.getStorageAt({
        address: diamondAddress,
        slot: toHex(elementBase + BigInt(i), { size: 32 }),
      });
      addresses.push(getAddress("0x" + elementData.slice(-40)));
    }
    return addresses;
  } catch {
    return [];
  }
}

async function fetchSourceForAddress(address, chainId, etherscanApiKey, routescanApiKey) {
  if (etherscanApiKey) {
    const result = await fetchFromEtherscan(address, chainId, etherscanApiKey);
    if (result?.sourceCode) return result;
  }

  const sourcifyResult = await fetchFromSourcify(address, chainId);
  if (sourcifyResult?.sourceCode) return sourcifyResult;

  const routescanResult = await fetchFromRouteScan(address, chainId, routescanApiKey);
  if (routescanResult?.sourceCode) return routescanResult;

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

    let result = await fetchSourceForAddress(address, chainId, etherscanApiKey, routescanApiKey);

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
          const facetResult = await fetchSourceForAddress(facet, chainId, etherscanApiKey, routescanApiKey);
          if (facetResult?.sourceCode) {
            Object.assign(facetSources, facetResult.sourceCode);
            if (!facetCompilerVersion) facetCompilerVersion = facetResult.compilerVersion;
          }
        }
        if (Object.keys(facetSources).length > 0) {
          const mergedSources = result?.sourceCode
            ? { ...facetSources, ...result.sourceCode }
            : facetSources;
          return NextResponse.json({
            sourceCode: mergedSources,
            compilerVersion: result?.compilerVersion || facetCompilerVersion || null,
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
