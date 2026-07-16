import { NextResponse } from "next/server";
import { createPublicClient, http, defineChain } from "viem";
import { isValidEthAddress } from "../../utils/validation";
import { fetchContractInfoFromSourcify } from "../../utils/sourcify";
import {
  BUILT_IN_CHAIN_IDS,
  VIEM_CHAINS,
  DEFAULT_RPC_URLS,
} from "../../utils/chains";

const ETHERSCAN_V2_API = "https://api.etherscan.io/v2/api";
const ROUTESCAN_API_BASE = "https://api.routescan.io/v2/network/mainnet/evm";

// EIP-1967 implementation slot
const EIP1967_IMPL_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
// EIP-1967 beacon slot
const EIP1967_BEACON_SLOT =
  "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50";
// OpenZeppelin legacy implementation slot
const OZ_IMPL_SLOT =
  "0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3";

// Fetch ABI and contract name from Etherscan
async function fetchContractInfoFromEtherscan(address, chainId, apiKey) {
  const params = new URLSearchParams({
    chainid: chainId,
    module: "contract",
    action: "getsourcecode",
    address: address,
    apikey: apiKey,
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
  };
}

// Fetch ABI and contract name from RouteScan
async function fetchContractInfoFromRouteScan(address, chainId, apiKey) {
  const params = new URLSearchParams({
    module: "contract",
    action: "getsourcecode",
    address: address,
  });
  if (apiKey) params.set("apikey", apiKey);

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
  };
}

// Try to fetch contract info from multiple sources
async function fetchContractInfo(
  address,
  chainId,
  etherscanApiKey,
  routescanApiKey,
) {
  // Try Sourcify first
  const sourcifyInfo = await fetchContractInfoFromSourcify(address, chainId);
  if (sourcifyInfo && sourcifyInfo.abi) {
    return sourcifyInfo;
  }

  // Fallback to Etherscan
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

  // Fallback to RouteScan
  const routescanInfo = await fetchContractInfoFromRouteScan(
    address,
    chainId,
    routescanApiKey,
  );
  if (routescanInfo && routescanInfo.abi) {
    return routescanInfo;
  }

  // Return partial info even if no ABI (for contract name)
  return routescanInfo || null;
}

// Get implementation address from proxy
async function getImplementationAddress(client, proxyAddress) {
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

// Merge two ABIs, preferring items from the second ABI for duplicates
function mergeAbis(proxyAbi, implAbi) {
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
  // Add implementation ABI items first (they take priority)
  for (const item of implAbi) {
    const key = getKey(item);
    seen.set(key, item);
  }

  // Add proxy ABI items (only if not already present)
  for (const item of proxyAbi) {
    const key = getKey(item);
    if (!seen.has(key)) {
      seen.set(key, item);
    }
  }

  return Array.from(seen.values());
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
  } = {},
) {
  const proxyInfo = await fetchContractInfo(
    address,
    chainId,
    etherscanKey,
    routescanKey,
  );
  if (!proxyInfo || !proxyInfo.abi) return null;

  let implAddress = null;
  if (proxyInfo.isProxy && proxyInfo.implementation) {
    implAddress = proxyInfo.implementation;
  } else if (detectProxy && viemChain && rpcUrl) {
    const client = createPublicClient({
      chain: viemChain,
      transport: http(rpcUrl),
    });
    implAddress = await getImplementationAddress(client, address);
  }

  if (implAddress) {
    const implInfo = await fetchContractInfo(
      implAddress,
      chainId,
      etherscanKey,
      routescanKey,
    );
    if (implInfo && implInfo.abi) {
      return {
        abi: mergeAbis(proxyInfo.abi, implInfo.abi),
        contractName: proxyInfo.contractName,
        implContractName: implInfo.contractName,
        isProxy: true,
        implAddress,
      };
    }
  }

  return {
    abi: proxyInfo.abi,
    contractName: proxyInfo.contractName,
    implContractName: null,
    isProxy: false,
    implAddress: null,
  };
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

    const customRpcUrl = searchParams.get("rpcUrl");
    const customChainIdParam = searchParams.get("chainId");

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

    const result = await fetchAbi(address, chainId, {
      etherscanKey: etherscanApiKey,
      routescanKey: routescanApiKey,
      viemChain: chainConfig,
      rpcUrl,
      detectProxy,
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
