"use client";

import { createContext, useContext, useState, useEffect } from "react";
import { BUILT_IN_CHAIN_IDS } from "../utils/chains";

const TENDERLY_SETTINGS_KEY = "tenderly_settings";
const API_KEYS_STORAGE_KEY = "api_keys_settings";
const RPC_SETTINGS_KEY = "rpc_settings";
const SIMULATION_SETTINGS_KEY = "simulation_settings";
const CUSTOM_CHAINS_KEY = "custom_chains";

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [showSettings, setShowSettings] = useState(false);
  const [tenderlySettings, setTenderlySettings] = useState({
    accessKey: "",
    account: "",
    project: "",
  });
  const [apiKeys, setApiKeys] = useState({ etherscan: "" });
  const [rpcSettings, setRpcSettings] = useState({
    ethereum: "",
    arbitrum: "",
    base: "",
    polygon: "",
    bsc: "",
  });
  const [useLocalSimulation, setUseLocalSimulation] = useState(true);
  const [rpcBatchSize, setRpcBatchSize] = useState(1);
  const [customChains, setCustomChains] = useState([]);

  // Load all settings from localStorage on mount
  useEffect(() => {
    try {
      const t = localStorage.getItem(TENDERLY_SETTINGS_KEY);
      if (t) setTenderlySettings(JSON.parse(t));
    } catch {}
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
        if (typeof parsed.useLocalSimulation === "boolean")
          setUseLocalSimulation(parsed.useLocalSimulation);
        if (typeof parsed.rpcBatchSize === "number" && parsed.rpcBatchSize >= 1)
          setRpcBatchSize(parsed.rpcBatchSize);
      }
    } catch {}
    try {
      const c = localStorage.getItem(CUSTOM_CHAINS_KEY);
      if (c) setCustomChains(JSON.parse(c));
    } catch {}
  }, []);

  const saveTenderlySettings = (s) => {
    setTenderlySettings(s);
    try {
      localStorage.setItem(TENDERLY_SETTINGS_KEY, JSON.stringify(s));
    } catch {}
  };

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

  const saveSimulationSettings = (useLocal, batchSize) => {
    setUseLocalSimulation(useLocal);
    setRpcBatchSize(batchSize);
    try {
      localStorage.setItem(
        SIMULATION_SETTINGS_KEY,
        JSON.stringify({ useLocalSimulation: useLocal, rpcBatchSize: batchSize }),
      );
    } catch {}
  };

  const saveCustomChains = (chains) => {
    setCustomChains(chains);
    try {
      localStorage.setItem(CUSTOM_CHAINS_KEY, JSON.stringify(chains));
    } catch {}
  };

  const isTenderlyConfigured = () =>
    !!(tenderlySettings.accessKey && tenderlySettings.account && tenderlySettings.project);

  const isEtherscanConfigured = () => !!apiKeys.etherscan;

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
        tenderlySettings,
        saveTenderlySettings,
        apiKeys,
        saveApiKeys,
        rpcSettings,
        saveRpcSettings,
        useLocalSimulation,
        rpcBatchSize,
        saveSimulationSettings,
        customChains,
        saveCustomChains,
        isTenderlyConfigured,
        isEtherscanConfigured,
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
