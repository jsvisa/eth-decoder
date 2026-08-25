import {
  createPublicClient,
  http,
  keccak256,
  toHex,
  decodeAbiParameters,
  getAddress,
} from "viem";
import {
  ETHERSCAN_V2_API,
  ROUTESCAN_API_BASE,
  pickApiKey,
  parseEtherscanSourceCode,
} from "./etherscan";
import { fetchContractInfoFromSourcify } from "./sourcify";
export { fetchContractInfoFromSourcify };

// Fetch source code from Sourcify (no ABI required, unlike fetchContractInfoFromSourcify)
export async function fetchSourceFromSourcify(address, chainId) {
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
import { BUILT_IN_CHAIN_IDS } from "./chains";

// EIP-1967 implementation slot
export const EIP1967_IMPL_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
// EIP-1967 beacon slot
export const EIP1967_BEACON_SLOT =
  "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50";
// OpenZeppelin legacy implementation slot
export const OZ_IMPL_SLOT =
  "0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3";

// EIP-2535 DiamondLoupe facetAddresses() selector
export const DIAMOND_FACET_ADDRESSES_SELECTOR = "0x52ef6b2c";

// EIP-2535 DiamondStorage struct layout (0-indexed):
//   0: selectorToFacetAndPosition (mapping)
//   1: facetFunctionSelectors (mapping)
//   2: facetAddresses (address[])
//   3: supportedInterfaces (mapping)
//   4: contractOwner (address)
export const DIAMOND_STORAGE_SLOT = keccak256(
  toHex("diamond.standard.diamond.storage"),
);

// Default max concurrent explorer fetches when resolving a diamond proxy's
// facets. Serial (1) by default to stay well within API rate limits; can be
// raised via a `concurrency` query parameter.
export const DEFAULT_FETCH_CONCURRENCY = 1;

// Fetch ABI and contract name from Etherscan
export async function fetchContractInfoFromEtherscan(address, chainId, apiKey) {
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

  if (!response.ok) {
    return null;
  }

  const data = await response.json();

  if (data.status !== "1" || !data.result || !data.result[0]) {
    return null;
  }

  const result = data.result[0];
  const abi =
    result.ABI && result.ABI !== "Contract source code not verified"
      ? JSON.parse(result.ABI)
      : null;

  return {
    abi,
    contractName: result.ContractName || null,
    isProxy: result.Proxy === "1",
    implementation: result.Implementation || null,
    source: "etherscan",
    sourceCode: parseEtherscanSourceCode(result.SourceCode),
    compilerVersion: result.CompilerVersion || null,
  };
}

// Fetch ABI and contract name from RouteScan
export async function fetchContractInfoFromRouteScan(address, chainId, apiKey) {
  const key = pickApiKey(apiKey);
  const params = new URLSearchParams({
    module: "contract",
    action: "getsourcecode",
    address: address,
  });
  if (key) params.set("apikey", key);

  const url = `${ROUTESCAN_API_BASE}/${chainId}/etherscan/api?${params}`;
  const response = await fetch(url);

  if (!response.ok) {
    return null;
  }

  const data = await response.json();

  if (data.status !== "1" || !data.result || !data.result[0]) {
    return null;
  }

  const result = data.result[0];
  const abi =
    result.ABI && result.ABI !== "Contract source code not verified"
      ? JSON.parse(result.ABI)
      : null;

  return {
    abi,
    contractName: result.ContractName || null,
    isProxy: result.Proxy === "1",
    implementation: result.Implementation || null,
    source: "routescan",
    sourceCode: parseEtherscanSourceCode(result.SourceCode),
    compilerVersion: result.CompilerVersion || null,
  };
}

// Try to fetch contract info from multiple sources
export async function fetchContractInfo(
  address,
  chainId,
  etherscanApiKey,
  routescanApiKey,
) {
  // Order matters: Etherscan first because its response includes the `Proxy`
  // and `Implementation` fields needed to resolve a proxy's implementation ABI.
  // Sourcify is tried next as a fallback for contracts not verified on Etherscan,
  // but note it does NOT return proxy fields, so proxy detection falls back to
  // on-chain RPC when the ABI comes from Sourcify. RouteScan is the keyless
  // fallback last.
  if (etherscanApiKey) {
    const etherscanInfo = await fetchContractInfoFromEtherscan(
      address,
      chainId,
      etherscanApiKey,
    );
    if (etherscanInfo && etherscanInfo.abi) {
      return etherscanInfo;
    }
  }

  // Fallback to Sourcify
  const sourcifyInfo = await fetchContractInfoFromSourcify(address, chainId);
  if (sourcifyInfo && sourcifyInfo.abi) {
    return sourcifyInfo;
  }

  // Fallback to RouteScan
  const routescanInfo = await fetchContractInfoFromRouteScan(
    address,
    chainId,
    routescanApiKey,
  );
  if (routescanInfo && routescanInfo.abi) {
    return routescanInfo;
  }

  // Return partial info even if no ABI (for contract name / source code)
  return routescanInfo || null;
}

// Get implementation address from proxy
export async function getImplementationAddress(client, proxyAddress) {
  // Try EIP-1967 implementation slot first
  try {
    const implSlotData = await client.getStorageAt({
      address: proxyAddress,
      slot: EIP1967_IMPL_SLOT,
    });

    if (
      implSlotData &&
      implSlotData !==
        "0x0000000000000000000000000000000000000000000000000000000000000000"
    ) {
      const implAddress = "0x" + implSlotData.slice(-40);
      if (implAddress !== "0x0000000000000000000000000000000000000000") {
        return implAddress;
      }
    }
  } catch (e) {
    // Ignore and try next slot
  }

  // Try beacon slot
  try {
    const beaconSlotData = await client.getStorageAt({
      address: proxyAddress,
      slot: EIP1967_BEACON_SLOT,
    });

    if (
      beaconSlotData &&
      beaconSlotData !==
        "0x0000000000000000000000000000000000000000000000000000000000000000"
    ) {
      const beaconAddress = "0x" + beaconSlotData.slice(-40);
      if (beaconAddress !== "0x0000000000000000000000000000000000000000") {
        // Call implementation() on the beacon
        try {
          const implData = await client.call({
            to: beaconAddress,
            data: "0x5c60da1b", // implementation()
          });
          if (implData.data && implData.data.length >= 66) {
            return "0x" + implData.data.slice(-40);
          }
        } catch (e) {
          // Beacon call failed
        }
      }
    }
  } catch (e) {
    // Ignore and try next slot
  }

  // Try OpenZeppelin legacy slot
  try {
    const ozSlotData = await client.getStorageAt({
      address: proxyAddress,
      slot: OZ_IMPL_SLOT,
    });

    if (
      ozSlotData &&
      ozSlotData !==
        "0x0000000000000000000000000000000000000000000000000000000000000000"
    ) {
      const implAddress = "0x" + ozSlotData.slice(-40);
      if (implAddress !== "0x0000000000000000000000000000000000000000") {
        return implAddress;
      }
    }
  } catch (e) {
    // Ignore
  }

  // Try Gnosis Safe proxy pattern (singleton/masterCopy stored at slot 0)
  try {
    const slot0Data = await client.getStorageAt({
      address: proxyAddress,
      slot: "0x0000000000000000000000000000000000000000000000000000000000000000",
    });

    if (
      slot0Data &&
      slot0Data !==
        "0x0000000000000000000000000000000000000000000000000000000000000000"
    ) {
      const candidateAddress = "0x" + slot0Data.slice(-40);
      if (candidateAddress !== "0x0000000000000000000000000000000000000000") {
        // Verify it's actually a contract to avoid false positives
        const code = await client.getCode({ address: candidateAddress });
        if (code && code !== "0x") {
          return candidateAddress;
        }
      }
    }
  } catch (e) {
    // Ignore
  }

  // Try EIP-1167 Minimal Proxy (Clone) - implementation address embedded in bytecode
  // Runtime bytecode pattern: 363d3d373d3d3d363d73<20-byte address>5af43d82803e903d91602b57fd5bf3
  try {
    const code = await client.getCode({ address: proxyAddress });
    if (code && code.length > 2) {
      const bytecode = code.toLowerCase();
      const prefix = "363d3d373d3d3d363d73";
      const suffix = "5af43d82803e903d91602b57fd5bf3";
      const prefixIndex = bytecode.indexOf(prefix);
      if (prefixIndex !== -1) {
        const addrStart = prefixIndex + prefix.length;
        const addrEnd = addrStart + 40;
        if (bytecode.substring(addrEnd, addrEnd + suffix.length) === suffix) {
          return "0x" + bytecode.substring(addrStart, addrEnd);
        }
      }
    }
  } catch (e) {
    // Ignore
  }

  return null;
}

// Get the facet addresses of an EIP-2535 diamond proxy.
// Cheap pre-check: a diamond always has >= 1 facet, so we read the standard
// DiamondStorage.facetAddresses array length first. For a plain contract that
// slot is 0, so this costs a single storage read and we bail out early.
// Once confirmed as a diamond, try the standard DiamondLoupe facetAddresses()
// call, then fall back to reading the storage array elements directly.
export async function getDiamondFacetAddresses(client, diamondAddress) {
  const arrSlot = BigInt(DIAMOND_STORAGE_SLOT) + 2n;

  // Cheap pre-check on the standard DiamondStorage.facetAddresses length
  let length;
  try {
    const lengthData = await client.getStorageAt({
      address: diamondAddress,
      slot: toHex(arrSlot, { size: 32 }),
    });
    length = parseInt(lengthData || "0x0", 16);
  } catch (e) {
    return [];
  }
  if (!length || length > 200) return [];

  // It's a diamond. Try the standard loupe interface first
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
  } catch (e) {
    // Not a loupe diamond; fall through to storage reading
  }

  // Fallback: read the standard DiamondStorage.facetAddresses array elements
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
  } catch (e) {
    return [];
  }
}

// Merge multiple ABIs, preferring items from earlier arguments for duplicates.
export function mergeAbis(...abiList) {
  const seen = new Map();

  // Helper to create a unique key for ABI items
  const getKey = (item) => {
    if (item.type === "function") {
      // Functions can be overloaded (same name, different params) in Solidity.
      // Include input types in the key so overloads aren't collapsed.
      const inputs = item.inputs?.map((i) => i.type).join(",") ?? "";
      return `${item.name}(${inputs})`;
    }
    if (item.type === "event") {
      return `event:${item.name}`;
    }
    if (item.type === "error") {
      return `error:${item.name}`;
    }
    return `${item.type}:${item.name || ""}`;
  };
  // Add items from each ABI in order; earlier arguments take priority
  for (const abi of abiList) {
    if (!abi) continue;
    for (const item of abi) {
      const key = getKey(item);
      if (!seen.has(key)) {
        seen.set(key, item);
      }
    }
  }

  return Array.from(seen.values());
}

// Merge multiple source code maps. Later sources overwrite earlier ones on
// filename collision (implementation source should take priority).
export function mergeSources(...sourceList) {
  const merged = {};
  for (const sources of sourceList) {
    if (sources) Object.assign(merged, sources);
  }
  return Object.keys(merged).length > 0 ? merged : null;
}

// Run an async mapper over items with at most `limit` concurrent tasks.
export async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

/**
 * Fetch and resolve the ABI for a contract address.
 * Handles proxy detection and ABI merging.
 *
 * @param {string} address - Contract address
 * @param {number} chainId - Numeric chain ID
 * @param {object} opts
 * @param {string} [opts.etherscanKey] - Etherscan API key
 * @param {string} [opts.routescanKey] - RouteScan API key
 * @param {object} [opts.viemChain] - viem chain object (required for on-chain proxy detection)
 * @param {string} [opts.rpcUrl] - RPC URL (required for on-chain proxy detection)
 * @param {boolean} [opts.detectProxy=true] - Whether to detect proxy contracts on-chain
 * @returns {Promise<{abi, contractName, implContractName, isProxy, implAddress}|null>}
 */
export async function fetchAbi(
  address,
  chainId,
  {
    etherscanKey = "",
    routescanKey = "",
    viemChain = null,
    rpcUrl = null,
    detectProxy = true,
    concurrency = DEFAULT_FETCH_CONCURRENCY,
  } = {},
) {
  const proxyInfo = await fetchContractInfo(
    address,
    chainId,
    etherscanKey,
    routescanKey,
  );
  if (!proxyInfo || !proxyInfo.abi) return null;

  let client = null;
  if (detectProxy && viemChain && rpcUrl) {
    client = createPublicClient({
      chain: viemChain,
      transport: http(rpcUrl),
    });
  }

  let implAddress = null;
  if (proxyInfo.isProxy && proxyInfo.implementation) {
    implAddress = proxyInfo.implementation;
  } else if (client) {
    implAddress = await getImplementationAddress(client, address);
  }

  let implInfo = null;
  if (implAddress) {
    implInfo = await fetchContractInfo(
      implAddress,
      chainId,
      etherscanKey,
      routescanKey,
    );
  }

  // Diamond proxy: discover all facets and fetch each of their ABIs.
  // getDiamondFacetAddresses does a cheap storage-length pre-check so plain
  // (non-diamond) contracts cost a single RPC call.
  let facetAddresses = [];
  let facetInfos = [];
  if (client) {
    facetAddresses = await getDiamondFacetAddresses(client, address);
    if (facetAddresses.length > 0) {
      facetInfos = await mapWithConcurrency(
        facetAddresses,
        concurrency,
        (facet) =>
          fetchContractInfo(facet, chainId, etherscanKey, routescanKey),
      );
    }
  }

  if (facetAddresses.length > 0) {
    // Merge order: implementation, proxy, then facets (earlier wins)
    const abisToMerge = [];
    if (implInfo && implInfo.abi) abisToMerge.push(implInfo.abi);
    abisToMerge.push(proxyInfo.abi);
    for (const fi of facetInfos) {
      if (fi && fi.abi) abisToMerge.push(fi.abi);
    }
    const facetSources = {};
    for (const fi of facetInfos) {
      if (fi?.sourceCode) Object.assign(facetSources, fi.sourceCode);
    }
    return {
      abi: mergeAbis(...abisToMerge),
      contractName: proxyInfo.contractName,
      implContractName: implInfo?.contractName ?? null,
      isProxy: true,
      isDiamond: true,
      implAddress,
      facetAddresses,
      facets: facetInfos.map((fi, i) => ({
        address: facetAddresses[i],
        name: fi?.contractName ?? null,
      })),
      source: proxyInfo.source,
      implSource: implInfo?.source ?? null,
      sourceCode: mergeSources(
        proxyInfo.sourceCode,
        facetSources,
        implInfo?.sourceCode,
      ),
      compilerVersion:
        implInfo?.compilerVersion || proxyInfo.compilerVersion || null,
    };
  }

  if (implInfo && implInfo.abi) {
    return {
      abi: mergeAbis(implInfo.abi, proxyInfo.abi),
      contractName: proxyInfo.contractName,
      implContractName: implInfo.contractName,
      isProxy: true,
      implAddress,
      source: proxyInfo.source,
      implSource: implInfo.source,
      sourceCode: mergeSources(proxyInfo.sourceCode, implInfo?.sourceCode),
      compilerVersion:
        implInfo.compilerVersion || proxyInfo.compilerVersion || null,
    };
  }

  return {
    abi: proxyInfo.abi,
    contractName: proxyInfo.contractName,
    implContractName: null,
    isProxy: false,
    implAddress: null,
    source: proxyInfo.source,
    implSource: null,
    sourceCode: proxyInfo.sourceCode || null,
    compilerVersion: proxyInfo.compilerVersion || null,
  };
}

// Resolve a chain identifier from the chain parameter and search params.
export async function resolveChainId(chain, searchParams) {
  let id = BUILT_IN_CHAIN_IDS[chain];
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
