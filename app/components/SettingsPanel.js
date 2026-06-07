"use client";

import { useState } from "react";
import { useSettings } from "../contexts/SettingsContext";
import { CHAINS, BUILT_IN_CHAIN_IDS } from "../utils/chains";
import styles from "./SettingsPanel.module.css";

// localStorage key constants (mirrored from SettingsContext)
const STORAGE_KEY = "contract_caller_history";
const ABI_CACHE_PREFIX = "abi-";
const TOKEN_SYMBOL_CACHE_PREFIX = "token-symbol-";
const TOKEN_DECIMALS_CACHE_PREFIX = "token-decimals-";
const TENDERLY_SETTINGS_KEY = "tenderly_settings";
const API_KEYS_STORAGE_KEY = "api_keys_settings";
const RPC_SETTINGS_KEY = "rpc_settings";
const SIMULATION_SETTINGS_KEY = "simulation_settings";
const CUSTOM_CHAINS_KEY = "custom_chains";

export default function SettingsPanel() {
  const {
    showSettings,
    setShowSettings,
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
    isTenderlyConfigured,
    isEtherscanConfigured,
    getChainId,
  } = useSettings();

  // UI-only state lives here (test results, etc.)
  const [testingEtherscan, setTestingEtherscan] = useState(false);
  const [etherscanTestResult, setEtherscanTestResult] = useState(null);
  const [testingTenderly, setTestingTenderly] = useState(false);
  const [tenderlyTestResult, setTenderlyTestResult] = useState(null);
  const [testingRpc, setTestingRpc] = useState({});
  const [rpcTestResult, setRpcTestResult] = useState({});
  const [selectedRpcChain, setSelectedRpcChain] = useState("ethereum");

  if (!showSettings) return null;

  const allChains = [...CHAINS, ...customChains];

  // ── Test functions ──────────────────────────────────────────────────────────

  const testEtherscanKey = async () => {
    if (!apiKeys.etherscan) return;
    setTestingEtherscan(true);
    setEtherscanTestResult(null);
    try {
      const res = await fetch(
        `https://api.etherscan.io/v2/api?chainid=1&module=account&action=balance&address=0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045&tag=latest&apikey=${apiKeys.etherscan}`,
      );
      const data = await res.json();
      setEtherscanTestResult(
        data.status === "1" || data.message === "OK" ? "success" : "error",
      );
    } catch {
      setEtherscanTestResult("error");
    } finally {
      setTestingEtherscan(false);
      setTimeout(() => setEtherscanTestResult(null), 3000);
    }
  };

  const testTenderlyKey = async () => {
    if (!isTenderlyConfigured()) return;
    setTestingTenderly(true);
    setTenderlyTestResult(null);
    try {
      const res = await fetch(
        `https://api.tenderly.co/api/v1/account/${tenderlySettings.account}/project/${tenderlySettings.project}`,
        { headers: { "X-Access-Key": tenderlySettings.accessKey } },
      );
      setTenderlyTestResult(res.ok ? "success" : "error");
    } catch {
      setTenderlyTestResult("error");
    } finally {
      setTestingTenderly(false);
      setTimeout(() => setTenderlyTestResult(null), 3000);
    }
  };

  const testRpcEndpoint = async (chainId) => {
    const rpcUrl = rpcSettings[chainId];
    if (!rpcUrl) return;
    setTestingRpc((p) => ({ ...p, [chainId]: true }));
    setRpcTestResult((p) => ({ ...p, [chainId]: null }));
    try {
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "eth_chainId", params: [], id: 1 }),
      });
      if (!res.ok) {
        setRpcTestResult((p) => ({ ...p, [chainId]: "error" }));
        return;
      }
      const data = await res.json();
      if (data.error) {
        setRpcTestResult((p) => ({ ...p, [chainId]: "error" }));
        return;
      }
      const returned = parseInt(data.result, 16);
      const expected = getChainId(chainId);
      setRpcTestResult((p) => ({
        ...p,
        [chainId]: returned === expected ? "success" : "mismatch",
      }));
    } catch {
      setRpcTestResult((p) => ({ ...p, [chainId]: "error" }));
    } finally {
      setTestingRpc((p) => ({ ...p, [chainId]: false }));
      setTimeout(() => setRpcTestResult((p) => ({ ...p, [chainId]: null })), 3000);
    }
  };

  // ── Export / Import ─────────────────────────────────────────────────────────

  const exportSettings = () => {
    const data = {};
    const exactKeys = [
      TENDERLY_SETTINGS_KEY,
      API_KEYS_STORAGE_KEY,
      RPC_SETTINGS_KEY,
      SIMULATION_SETTINGS_KEY,
      CUSTOM_CHAINS_KEY,
      "address_book",
      STORAGE_KEY,
      "evm_decoder_history",
    ];
    for (const key of exactKeys) {
      const val = localStorage.getItem(key);
      if (val != null) data[key] = val;
    }
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (
        key &&
        (key.startsWith(ABI_CACHE_PREFIX) ||
          key.startsWith(TOKEN_SYMBOL_CACHE_PREFIX) ||
          key.startsWith(TOKEN_DECIMALS_CACHE_PREFIX))
      ) {
        data[key] = localStorage.getItem(key);
      }
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "evm-tools-settings.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importSettings = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        for (const [key, value] of Object.entries(data)) {
          if (typeof value === "string") localStorage.setItem(key, value);
        }
        window.location.reload();
      } catch (err) {
        alert("Failed to import settings: " + err.message);
      }
    };
    reader.readAsText(file);
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) setShowSettings(false); }}>
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2 className={styles.panelTitle}>Settings</h2>
          <button className={styles.closeBtn} onClick={() => setShowSettings(false)} type="button">×</button>
        </div>

        {/* Etherscan API Key */}
        <div className={styles.settingsGroup}>
          <h3 className={styles.settingsTitle}>
            Etherscan API Key
            {isEtherscanConfigured() && <span className={styles.settingsCheck}>✓</span>}
          </h3>
          <p className={styles.settingsDesc}>
            Required for fetching contract ABIs. Get your free API key from{" "}
            <a href="https://etherscan.io/myapikey" target="_blank" rel="noopener noreferrer">Etherscan</a>
          </p>
          <div className={styles.settingsFieldWithTest}>
            <input
              type="password"
              value={apiKeys.etherscan}
              onChange={(e) => saveApiKeys({ ...apiKeys, etherscan: e.target.value })}
              placeholder="Enter your Etherscan API key..."
              className={styles.settingsInput}
            />
            <button
              onClick={testEtherscanKey}
              disabled={!apiKeys.etherscan || testingEtherscan}
              className={`${styles.testButton} ${etherscanTestResult === "success" ? styles.testSuccess : ""} ${etherscanTestResult === "error" ? styles.testError : ""}`}
            >
              {testingEtherscan ? "Testing..." : etherscanTestResult === "success" ? "✓ Valid" : etherscanTestResult === "error" ? "✗ Invalid" : "Test"}
            </button>
          </div>
        </div>

        {/* Simulation Mode */}
        <div className={styles.settingsGroup}>
          <h3 className={styles.settingsTitle}>
            Simulation Mode
            {useLocalSimulation && <span className={styles.settingsCheck}>✓ Local</span>}
          </h3>
          <p className={styles.settingsDesc}>
            Choose between local browser-based simulation (Tevm) or Tenderly API.
          </p>
          <div className={styles.settingsFields}>
            <div className={styles.settingRow}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={useLocalSimulation}
                  onChange={(e) => saveSimulationSettings(e.target.checked, rpcBatchSize)}
                />
                <span>Use Local Simulation (Tevm — no API keys required)</span>
              </label>
              <label className={styles.settingLabel}>
                Batch Size
                <span className={styles.settingHint}> (1 = no batching)</span>
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={rpcBatchSize}
                  className={styles.settingInput}
                  onChange={(e) =>
                    saveSimulationSettings(useLocalSimulation, Math.max(1, parseInt(e.target.value) || 1))
                  }
                />
              </label>
            </div>
          </div>
        </div>

        {/* Tenderly Settings */}
        <div className={styles.settingsGroup}>
          <h3 className={styles.settingsTitle}>
            Tenderly API Settings
            {isTenderlyConfigured() && <span className={styles.settingsCheck}>✓</span>}
          </h3>
          <p className={styles.settingsDesc}>
            {useLocalSimulation ? "Optional when using Local Simulation." : "Required for simulating write functions."}{" "}
            Get your credentials from{" "}
            <a href="https://dashboard.tenderly.co/account/authorization" target="_blank" rel="noopener noreferrer">Tenderly Dashboard</a>
          </p>
          <div className={styles.settingsFields}>
            <div className={styles.settingsField}>
              <label className={styles.settingsLabel}>Access Key</label>
              <input type="password" value={tenderlySettings.accessKey}
                onChange={(e) => saveTenderlySettings({ ...tenderlySettings, accessKey: e.target.value })}
                placeholder="Enter your Tenderly access key..." className={styles.settingsInput} />
            </div>
            <div className={styles.settingsField}>
              <label className={styles.settingsLabel}>Account Slug</label>
              <input type="text" value={tenderlySettings.account}
                onChange={(e) => saveTenderlySettings({ ...tenderlySettings, account: e.target.value })}
                placeholder="Your account slug (from URL)" className={styles.settingsInput} />
            </div>
            <div className={styles.settingsField}>
              <label className={styles.settingsLabel}>Project Slug</label>
              <input type="text" value={tenderlySettings.project}
                onChange={(e) => saveTenderlySettings({ ...tenderlySettings, project: e.target.value })}
                placeholder="Your project slug (from URL)" className={styles.settingsInput} />
            </div>
          </div>
          <button onClick={testTenderlyKey} disabled={!isTenderlyConfigured() || testingTenderly}
            className={`${styles.testButton} ${tenderlyTestResult === "success" ? styles.testSuccess : ""} ${tenderlyTestResult === "error" ? styles.testError : ""}`}
            style={{ marginTop: "1rem" }}>
            {testingTenderly ? "Testing..." : tenderlyTestResult === "success" ? "✓ Valid" : tenderlyTestResult === "error" ? "✗ Invalid" : "Test Connection"}
          </button>
        </div>

        {/* Custom RPC Endpoints */}
        <div className={styles.settingsGroup}>
          <h3 className={styles.settingsTitle}>
            Custom RPC Endpoints <span className={styles.optional}>(optional)</span>
          </h3>
          <p className={styles.settingsDesc}>
            Configure custom RPC endpoints for each chain. If not set, default public RPCs will be used.
          </p>
          <div className={styles.settingsFields}>
            <div className={styles.settingsField}>
              <label className={styles.settingsLabel}>Chain</label>
              <div className={styles.chainSelectWithIcon}>
                {allChains.find((c) => c.id === selectedRpcChain)?.icon && (
                  <img src={allChains.find((c) => c.id === selectedRpcChain)?.icon} alt=""
                    className={styles.chainIconSmall} onError={(e) => { e.target.style.display = "none"; }} />
                )}
                <select value={selectedRpcChain} onChange={(e) => setSelectedRpcChain(e.target.value)} className={styles.select}>
                  {[...allChains].sort((a, b) => a.name.localeCompare(b.name)).map((c) => {
                    const chainIdNum = c.chainId || BUILT_IN_CHAIN_IDS[c.id];
                    return (
                      <option key={c.id} value={c.id}>
                        {c.name} ({chainIdNum}) {rpcSettings[c.id] ? "✓" : ""}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
            <div className={styles.settingsField}>
              <label className={styles.settingsLabel}>RPC URL</label>
              <div className={styles.settingsFieldWithTest}>
                <input type="text" value={rpcSettings[selectedRpcChain] || ""}
                  onChange={(e) => saveRpcSettings({ ...rpcSettings, [selectedRpcChain]: e.target.value })}
                  placeholder={`Custom RPC URL for ${allChains.find((c) => c.id === selectedRpcChain)?.name}...`}
                  className={styles.settingsInput} />
                <button onClick={() => testRpcEndpoint(selectedRpcChain)}
                  disabled={!rpcSettings[selectedRpcChain] || testingRpc[selectedRpcChain]}
                  className={`${styles.testButton} ${rpcTestResult[selectedRpcChain] === "success" ? styles.testSuccess : ""} ${rpcTestResult[selectedRpcChain] === "error" || rpcTestResult[selectedRpcChain] === "mismatch" ? styles.testError : ""}`}>
                  {testingRpc[selectedRpcChain] ? "Testing..."
                    : rpcTestResult[selectedRpcChain] === "success" ? "✓ Valid"
                    : rpcTestResult[selectedRpcChain] === "mismatch" ? "✗ Wrong Chain"
                    : rpcTestResult[selectedRpcChain] === "error" ? "✗ Failed"
                    : "Test"}
                </button>
              </div>
            </div>
          </div>
          {Object.entries(rpcSettings).filter(([, url]) => url).length > 0 && (
            <div className={styles.configuredRpcList}>
              <label className={styles.settingsLabel} style={{ marginTop: "1rem" }}>Configured RPCs:</label>
              {Object.entries(rpcSettings).filter(([, url]) => url).map(([chainId, url]) => {
                const chainInfo = allChains.find((c) => c.id === chainId);
                return (
                  <div key={chainId} className={styles.configuredRpcItem}>
                    {chainInfo?.icon && (
                      <img src={chainInfo.icon} alt="" className={styles.chainIconTiny} />
                    )}
                    <span className={styles.configuredRpcChain}>{chainInfo?.name || chainId}</span>
                    <span className={styles.configuredRpcUrl} title={url}>
                      {url.length > 40 ? url.slice(0, 40) + "..." : url}
                    </span>
                    <button className={styles.removeRpcButton}
                      onClick={() => saveRpcSettings({ ...rpcSettings, [chainId]: "" })} title="Remove">×</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Sync Settings */}
        <div className={styles.settingsGroup}>
          <h3 className={styles.settingsTitle}>Sync Settings</h3>
          <p className={styles.settingsDesc}>
            Settings and caches are stored per-origin (host). Use export / import to sync between{" "}
            <code>localhost</code>, <code>127.0.0.1</code>, and production.
          </p>
          <div className={styles.syncButtons}>
            <button className={styles.syncBtn} onClick={exportSettings} type="button">Export</button>
            <label className={styles.syncBtn} style={{ cursor: "pointer" }}>
              Import
              <input type="file" accept=".json" style={{ display: "none" }}
                onChange={(e) => { if (e.target.files?.[0]) importSettings(e.target.files[0]); }} />
            </label>
          </div>
        </div>

        <p className={styles.settingsNote}>
          All settings are stored locally in your browser and never sent to our servers.
        </p>
      </div>
    </div>
  );
}
