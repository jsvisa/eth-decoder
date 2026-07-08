"use client";

import { createContext, useContext, useState, useEffect } from "react";
import { CHAINS, BUILT_IN_CHAIN_IDS } from "../utils/chains";

const API_KEYS_STORAGE_KEY = "api_keys_settings";
const RPC_SETTINGS_KEY = "rpc_settings";
const SIMULATION_SETTINGS_KEY = "simulation_settings";
const CUSTOM_CHAINS_KEY = "custom_chains";

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [showSettings, setShowSettings] = useState(false);
  const [apiKeys, setApiKeys] = useState({ etherscan: "", routescan: "" });
  const [rpcSettings, setRpcSettings] = useState(() =>
    CHAINS.reduce((acc, c) => ({ ...acc, [c.id]: "" }), {}),
  );
  const [rpcBatchSize, setRpcBatchSize] = useState(1);
  const [customChains, setCustomChains] = useState([]);

  // Load all settings from localStorage on mount
  useEffect(() => {
    try {
      const a = localStorage.getItem(API_KEYS_STORAGE_KEY);
      if (a) setApiKeys(JSON.parse(a));
    } catch {}
    try {
      const r = localStorage.getItem(RPC_SETTINGS_KEY);
      if (r) setRpcSettings(JSON.parse(r));
    } catch {}
    try {
      const s = localStorage.getItem(SIMULATION_SETTINGS_KEY);
      if (s) {
        const parsed = JSON.parse(s);
        if (typeof parsed.rpcBatchSize === "number" && parsed.rpcBatchSize >= 1)
          setRpcBatchSize(parsed.rpcBatchSize);
      }
    } catch {}
    try {
      const c = localStorage.getItem(CUSTOM_CHAINS_KEY);
      if (c) setCustomChains(JSON.parse(c));
    } catch {}
  }, []);

  const saveApiKeys = (k) => {
    setApiKeys(k);
    try {
      localStorage.setItem(API_KEYS_STORAGE_KEY, JSON.stringify(k));
    } catch {}
  };

  const saveRpcSettings = (s) => {
    setRpcSettings(s);
    try {
      localStorage.setItem(RPC_SETTINGS_KEY, JSON.stringify(s));
    } catch {}
  };

  const saveSimulationSettings = (batchSize) => {
    setRpcBatchSize(batchSize);
    try {
      localStorage.setItem(
        SIMULATION_SETTINGS_KEY,
        JSON.stringify({
          rpcBatchSize: batchSize,
        }),
      );
    } catch {}
  };

  const saveCustomChains = (chains) => {
    setCustomChains(chains);
    try {
      localStorage.setItem(CUSTOM_CHAINS_KEY, JSON.stringify(chains));
    } catch {}
  };

  const isEtherscanConfigured = () => !!apiKeys.etherscan;

  const isRoutescanConfigured = () => !!apiKeys.routescan;

  const getChainId = (chainId) => {
    if (BUILT_IN_CHAIN_IDS[chainId]) return BUILT_IN_CHAIN_IDS[chainId];
    const custom = customChains.find((c) => c.id === chainId);
    return custom?.chainId || null;
  };

  const toggleSettings = () => setShowSettings((v) => !v);

  return (
    <SettingsContext.Provider
      value={{
        showSettings,
        setShowSettings,
        toggleSettings,
        apiKeys,
        saveApiKeys,
        rpcSettings,
        saveRpcSettings,
        rpcBatchSize,
        saveSimulationSettings,
        customChains,
        saveCustomChains,
        isEtherscanConfigured,
        isRoutescanConfigured,
        getChainId,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
