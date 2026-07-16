"use client";

import { useState, useEffect } from "react";
import { isValidEthAddress } from "../../utils/validation";
import { getCachedAbi, setCachedAbi } from "../../utils/abiCache";
import { isReadOnly } from "../utils/functionArgs";

const ABI_CACHE_PREFIX = "abi-";

const formatAbiCompact = (abi) => {
  const hasNestedComponents = (params) => {
    return params?.some((p) => p.components && p.components.length > 0);
  };

  const formatParams = (params) => {
    if (!params || params.length === 0) return "[]";
    if (hasNestedComponents(params)) {
      return JSON.stringify(params, null, 2);
    }
    return "[" + params.map((p) => JSON.stringify(p)).join(", ") + "]";
  };

  return (
    "[\n" +
    abi
      .map((item) => {
        if (item.type === "function") {
          const parts = [
            `  "type": "function"`,
            `  "name": "${item.name}"`,
            `  "inputs": ${formatParams(item.inputs)}`,
            `  "outputs": ${formatParams(item.outputs)}`,
            `  "stateMutability": "${item.stateMutability || "nonpayable"}"`,
          ];
          return "  {\n  " + parts.join(",\n  ") + "\n  }";
        }
        return "  " + JSON.stringify(item, null, 2).split("\n").join("\n  ");
      })
      .join(",\n") +
    "\n]"
  );
};

const getCachedAddresses = () => {
  const addresses = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(ABI_CACHE_PREFIX)) {
        const withoutPrefix = key.substring(ABI_CACHE_PREFIX.length);

        let chain, address;
        if (withoutPrefix.startsWith("chain-")) {
          const addressIndex = withoutPrefix.indexOf("-0x");
          if (addressIndex === -1) continue;
          chain = withoutPrefix.substring(0, addressIndex);
          address = withoutPrefix.substring(addressIndex + 1);
        } else {
          const firstDash = withoutPrefix.indexOf("-");
          if (firstDash === -1) continue;
          chain = withoutPrefix.substring(0, firstDash);
          address = withoutPrefix.substring(firstDash + 1);
        }

        const cached = JSON.parse(localStorage.getItem(key));
        addresses.push({
          chain,
          address,
          contractName: cached.contractName,
          implContractName: cached.implContractName,
          isProxy: cached.isProxy,
        });
      }
    }
  } catch (err) {
    console.error("Failed to get cached addresses:", err);
  }
  return addresses;
};

// ---------------------------------------------------------------------------
// useAbi hook
//
// Parameters:
//   chain       {string}   - current chain id (e.g. "ethereum")
//   address     {string}   - current contract address
//   apiKeys     {object}   - { etherscan, routescan } API keys
//   rpcSettings {object}   - map of chain -> custom RPC URL
//   getChainId  {function} - (chain) => numeric chain id (from SettingsContext)
//   onAbiParsed {function} - optional callback(parsedAbi, functions) for cross-
//                            cutting effects (e.g. resetting selectedFunction)
//   onAbiError  {function} - optional callback(errorMsg) for cross-cutting error
//   onSetError  {function} - optional callback(errorMsg) used by fetchAbi /
//                            saveAbiToCache to surface errors to the parent
// ---------------------------------------------------------------------------
export function useAbi({
  chain,
  address,
  apiKeys = {},
  rpcSettings = {},
  getChainId = () => null,
  onAbiParsed = null,
  onAbiError = null,
  onSetError = null,
} = {}) {
  const [abi, setAbi] = useState("");
  const [parsedAbi, setParsedAbi] = useState(null);
  const [functions, setFunctions] = useState([]);
  const [fetchingAbi, setFetchingAbi] = useState(false);
  const [abiSource, setAbiSource] = useState(null);
  const [contractName, setContractName] = useState(null);
  const [abiSaved, setAbiSaved] = useState(false);
  const [cachedAddresses, setCachedAddresses] = useState([]);
  const [abiCollapsed, setAbiCollapsed] = useState(true);
  const [abiViewMode, setAbiViewMode] = useState("list");
  const [abiFilter, setAbiFilter] = useState("");
  const [abiCopiedItem, setAbiCopiedItem] = useState(null);

  useEffect(() => {
    setCachedAddresses(getCachedAddresses());
  }, []);

  // -------------------------------------------------------------------------
  // Effect 1: Auto-load cached ABI when address or chain changes (lines 1533–1560)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!isValidEthAddress(address)) {
      setContractName(null);
      return;
    }

    const cached = getCachedAbi(chain, address);
    if (cached) {
      setAbi(formatAbiCompact(cached.abi));
      const nameDisplay =
        cached.isProxy && cached.implContractName
          ? `${cached.contractName} → ${cached.implContractName}`
          : cached.contractName;
      setContractName(nameDisplay);
      setAbiSource(
        cached.isProxy
          ? `cached (proxy → ${cached.implAddress?.slice(0, 10)}...)`
          : "cached",
      );
    } else {
      // Clear ABI when switching to uncached contract
      setAbi("");
      setParsedAbi(null);
      setAbiSource(null);
      setContractName(null);
    }
  }, [chain, address]);

  // -------------------------------------------------------------------------
  // Effect 2: Parse ABI when it changes (lines 1562–1625)
  // Cross-cutting side effects (setSelectedFunction, setArgs, etc.) are
  // delegated to onAbiParsed / onAbiError so the hook stays self-contained.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!abi.trim()) {
      setParsedAbi(null);
      setFunctions([]);
      if (onAbiParsed) onAbiParsed(null, []);
      return;
    }

    try {
      const parsed = JSON.parse(abi);
      setParsedAbi(parsed);

      // Get all functions (both read and write)
      const allFunctions = parsed.filter((item) => item.type === "function");

      // Sort: view/pure first, then others
      allFunctions.sort((a, b) => {
        const aIsRead = isReadOnly(a);
        const bIsRead = isReadOnly(b);
        if (aIsRead && !bIsRead) return -1;
        if (!aIsRead && bIsRead) return 1;
        return a.name.localeCompare(b.name);
      });

      setFunctions(allFunctions);

      if (onAbiParsed) onAbiParsed(parsed, allFunctions);
    } catch (err) {
      setParsedAbi(null);
      setFunctions([]);
      if (onAbiError) onAbiError("Invalid ABI JSON format");
    }
  }, [abi]);

  // -------------------------------------------------------------------------
  // Callback: fetchAbi (lines 1847–1934)
  // -------------------------------------------------------------------------
  const fetchAbi = async (forceRefresh = false) => {
    if (!address?.trim()) {
      if (onSetError) onSetError("Please enter a contract address");
      return;
    }

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = getCachedAbi(chain, address);
      if (cached) {
        setAbi(formatAbiCompact(cached.abi));
        const nameDisplay =
          cached.isProxy && cached.implContractName
            ? `${cached.contractName} → ${cached.implContractName}`
            : cached.contractName;
        setContractName(nameDisplay);
        setAbiSource(
          cached.isProxy
            ? `cached (proxy → ${cached.implAddress?.slice(0, 10)}...)`
            : "cached",
        );
        return;
      }
    }

    setFetchingAbi(true);
    if (onSetError) onSetError(null);

    try {
      const params = new URLSearchParams({ address, chain });
      if (apiKeys.etherscan) {
        params.set("etherscanApiKey", apiKeys.etherscan);
      }
      if (apiKeys.routescan) {
        params.set("routescanApiKey", apiKeys.routescan);
      }
      if (rpcSettings[chain]) {
        params.set("rpcUrl", rpcSettings[chain]);
      }
      const chainIdForApi = getChainId(chain);
      if (chainIdForApi) {
        params.set("chainId", chainIdForApi.toString());
      }
      params.set("detectProxy", "true");

      const response = await fetch(`/api/fetch-abi?${params}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch ABI");
      }

      // Cache the fetched ABI
      setCachedAbi(
        chain,
        address,
        data.abi,
        data.isProxy,
        data.implAddress,
        data.contractName,
        data.implContractName,
      );

      // Update cached addresses list
      setCachedAddresses(getCachedAddresses());

      setAbi(formatAbiCompact(data.abi));
      const nameDisplay =
        data.isProxy && data.implContractName
          ? `${data.contractName} → ${data.implContractName}`
          : data.contractName;
      setContractName(nameDisplay);
      setAbiSource(
        data.isProxy
          ? `fetched (proxy → ${data.implAddress?.slice(0, 10)}...)`
          : "fetched",
      );
      // Expand ABI when first fetched from remote
      setAbiCollapsed(false);
    } catch (err) {
      if (onSetError) onSetError(err.message);
    } finally {
      setFetchingAbi(false);
    }
  };

  // -------------------------------------------------------------------------
  // Callback: saveAbiToCache (lines 1937–1965)
  // -------------------------------------------------------------------------
  const saveAbiToCache = () => {
    if (!address || !abi) return;

    try {
      const parsedAbiToSave = JSON.parse(abi);
      const existingCache = getCachedAbi(chain, address);
      setCachedAbi(
        chain,
        address,
        parsedAbiToSave,
        existingCache?.isProxy || false,
        existingCache?.implAddress || null,
        existingCache?.contractName || contractName,
        existingCache?.implContractName || null,
      );
      // Update cached addresses list
      setCachedAddresses(getCachedAddresses());
      // Show feedback
      setAbiSaved(true);
      setTimeout(() => setAbiSaved(false), 2000);
      // Update source to indicate it's now cached
      if (!abiSource?.includes("cached")) {
        setAbiSource("cached (manual)");
      }
    } catch (err) {
      if (onSetError) onSetError("Failed to save ABI: Invalid JSON format");
    }
  };

  return {
    abi,
    setAbi,
    parsedAbi,
    functions,
    fetchingAbi,
    abiSource,
    contractName,
    abiSaved,
    cachedAddresses,
    abiCollapsed,
    setAbiCollapsed,
    abiViewMode,
    setAbiViewMode,
    abiFilter,
    setAbiFilter,
    abiCopiedItem,
    setAbiCopiedItem,
    getCachedAddresses,
    setCachedAddressesState: setCachedAddresses,
    fetchAbi,
    saveAbiToCache,
  };
}
