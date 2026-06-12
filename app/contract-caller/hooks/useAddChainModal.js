"use client";

import { useState, useEffect, useRef } from "react";
import { useSettings } from "../../contexts/SettingsContext";
import { CHAINS, BUILT_IN_CHAIN_IDS } from "../../utils/chains";

const CUSTOM_CHAINS_KEY = "custom_chains";

export function useAddChainModal({ chain, setChain }) {
  const { customChains, saveCustomChains, rpcSettings, saveRpcSettings } =
    useSettings();

  const [showAddChainModal, setShowAddChainModal] = useState(false);
  const [chainlistData, setChainlistData] = useState([]);
  const [chainlistLoading, setChainlistLoading] = useState(false);
  const [chainlistSearch, setChainlistSearch] = useState("");
  const [chainlistError, setChainlistError] = useState(null);
  const [addedChainsCollapsed, setAddedChainsCollapsed] = useState(true);

  const searchInputRef = useRef(null);

  // Focus chain search input when add chain modal opens
  useEffect(() => {
    if (showAddChainModal && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [showAddChainModal]);

  // Fetch chainlist data from chainlist.org (lazy: only on first open)
  const fetchChainlistData = async () => {
    if (chainlistData.length > 0) return; // Already loaded

    setChainlistLoading(true);
    setChainlistError(null);

    try {
      const response = await fetch("https://chainlist.org/rpcs.json");
      if (!response.ok) {
        throw new Error("Failed to fetch chainlist data");
      }
      const data = await response.json();
      // Filter out testnets and sort by TVL (higher first)
      const mainnets = data
        .filter((c) => !c.isTestnet && c.chainId)
        .sort((a, b) => (b.tvl || 0) - (a.tvl || 0));
      setChainlistData(mainnets);
    } catch (err) {
      console.error("Failed to fetch chainlist:", err);
      setChainlistError("Failed to load chain data. Please try again.");
    } finally {
      setChainlistLoading(false);
    }
  };

  const openAddChainModal = () => {
    setShowAddChainModal(true);
    fetchChainlistData();
  };

  const closeAddChainModal = () => {
    setShowAddChainModal(false);
    setChainlistSearch("");
  };

  // Get the best RPC URL from a chain's RPC list
  const getBestRpcUrl = (rpcs) => {
    if (!rpcs || rpcs.length === 0) return null;
    const trackingOrder = { none: 0, limited: 1, yes: 2, undefined: 3 };
    const sortedRpcs = [...rpcs].sort((a, b) => {
      const aTracking =
        typeof a === "string" ? "undefined" : a.tracking || "undefined";
      const bTracking =
        typeof b === "string" ? "undefined" : b.tracking || "undefined";
      return (trackingOrder[aTracking] || 3) - (trackingOrder[bTracking] || 3);
    });
    for (const rpc of sortedRpcs) {
      const url = typeof rpc === "string" ? rpc : rpc.url;
      if (url && !url.includes("${") && url.startsWith("http")) {
        return url;
      }
    }
    return null;
  };

  // Add a custom chain from chainlist data
  const addCustomChain = (chainData) => {
    const chainId = `chain-${chainData.chainId}`;

    // Already added as a custom chain
    if (customChains.some((c) => c.id === chainId)) {
      return false;
    }

    // Already a built-in chain
    if (
      CHAINS.some(
        (c) =>
          c.id === chainId || BUILT_IN_CHAIN_IDS[c.id] === chainData.chainId,
      )
    ) {
      return false;
    }

    const bestRpc = getBestRpcUrl(chainData.rpc);

    const newChain = {
      id: chainId,
      name: chainData.name,
      chainId: chainData.chainId,
      icon: chainData.icon
        ? `https://icons.llamao.fi/icons/chains/rsz_${chainData.icon}.jpg`
        : null,
      nativeCurrency: chainData.nativeCurrency,
      rpcUrl: bestRpc,
      explorers: chainData.explorers || [],
    };

    const updatedChains = [...customChains, newChain];
    saveCustomChains(updatedChains);
    localStorage.setItem(CUSTOM_CHAINS_KEY, JSON.stringify(updatedChains));

    if (bestRpc) {
      saveRpcSettings({ ...rpcSettings, [chainId]: bestRpc });
    }

    return true;
  };

  // Remove a custom chain by its id slug (e.g. "chain-12345")
  const removeCustomChain = (chainId) => {
    const updatedChains = customChains.filter((c) => c.id !== chainId);
    saveCustomChains(updatedChains);
    localStorage.setItem(CUSTOM_CHAINS_KEY, JSON.stringify(updatedChains));

    if (rpcSettings[chainId]) {
      const newRpcSettings = { ...rpcSettings };
      delete newRpcSettings[chainId];
      saveRpcSettings(newRpcSettings);
    }

    // If the currently selected chain is removed, switch to ethereum
    if (chain === chainId) {
      setChain("ethereum");
    }
  };

  // Check if a chainlist entry is already added (custom or built-in)
  const isChainAdded = (chainData) => {
    const chainId = `chain-${chainData.chainId}`;
    return (
      customChains.some((c) => c.id === chainId) ||
      Object.values(BUILT_IN_CHAIN_IDS).includes(chainData.chainId)
    );
  };

  return {
    showAddChainModal,
    openAddChainModal,
    closeAddChainModal,
    chainlistData,
    chainlistLoading,
    chainlistError,
    chainlistSearch,
    setChainlistSearch,
    addedChainsCollapsed,
    setAddedChainsCollapsed,
    addCustomChain,
    removeCustomChain,
    isChainAdded,
    searchInputRef,
  };
}
