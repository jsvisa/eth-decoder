"use client";

import { useEffect, useState, useRef } from "react";
import { useSettings } from "../contexts/SettingsContext";
import { CHAINS, BUILT_IN_CHAIN_IDS } from "../utils/chains";
import { isValidEthAddress, checksumAddress } from "../utils/validation";
import Tabs from "../components/Tabs";
import { useTabState } from "../components/useTabState";

import { useAbi } from "./hooks/useAbi";
import { useFunctionSelection } from "./hooks/useFunctionSelection";
import { useSimulationOptions } from "./hooks/useSimulationOptions";
import { useTevmSession } from "./hooks/useTevmSession";
import { useCallExecution } from "./hooks/useCallExecution";
import { useEventLogs } from "./hooks/useEventLogs";
import { useHistory } from "./hooks/useHistory";
import { useBookmarkModal } from "./hooks/useBookmarkModal";
import { useAddChainModal } from "./hooks/useAddChainModal";
import { useTokenMetadata } from "./hooks/useTokenMetadata";
import { getFunctionSig, isReadOnly, isPayable } from "./utils/functionArgs";
import {
  NATIVE_TOKEN_SYMBOLS,
  enrichBalanceChanges,
} from "../utils/balanceChanges";
import {
  decodeLogsViaServer,
  decodeCallTraceLogsViaServer,
} from "../utils/tevmSimulator";

import NetworkSelector from "./components/NetworkSelector";
import ContractAddressInput from "./components/ContractAddressInput";
import AbiPanel from "./components/AbiPanel";
import FunctionEventsTabs from "./components/FunctionEventsTabs";
import FunctionSelector from "./components/FunctionSelector";
import CalldataSection from "./components/CalldataSection";
import SimulationOptions from "./components/SimulationOptions";
import ArgsInput from "./components/ArgsInput";
import EventsTab from "./components/EventsTab";
import CallActionBar from "./components/CallActionBar";
import ResultPanel from "./components/ResultPanel";
import SessionHistoryStrip from "./components/SessionHistoryStrip";
import HistorySidebar from "./components/HistorySidebar";
import BookmarkModal from "./components/BookmarkModal";
import AddChainModal from "./components/AddChainModal";

import styles from "./page.module.css";

const TABS_STORAGE_KEY = "contract_caller_tabs_v1";
const DEFAULT_TAB_ID = "caller-1";

const validateAddressesInArg = (
  argValue,
  input,
  errors,
  argIndex,
  argErrors,
  path = "",
) => {
  const type = input.type;

  if (type === "address") {
    if (!argValue || !isValidEthAddress(argValue)) {
      errors[`arg_${argIndex}`] = true;
      const fieldName = path || input.name || `Argument ${argIndex + 1}`;
      argErrors.push(`${fieldName} must be a valid Ethereum address`);
      return false;
    }
    return true;
  }

  if (type === "address[]") {
    if (!argValue) return true;
    try {
      const addresses =
        typeof argValue === "string" ? JSON.parse(argValue) : argValue;
      if (Array.isArray(addresses)) {
        let valid = true;
        addresses.forEach((addressValue, index) => {
          if (!isValidEthAddress(addressValue)) {
            errors[`arg_${argIndex}`] = true;
            const fieldName = path || input.name || `Argument ${argIndex + 1}`;
            argErrors.push(
              `${fieldName}[${index}] must be a valid Ethereum address`,
            );
            valid = false;
          }
        });
        return valid;
      }
    } catch {
      return true;
    }
    return true;
  }

  if (type === "tuple" && input.components) {
    if (!argValue) return true;
    const tupleValue = Array.isArray(argValue) ? argValue : [];
    let valid = true;
    input.components.forEach((component, index) => {
      const componentPath = path
        ? `${path}.${component.name || index}`
        : `${input.name || `Argument ${argIndex + 1}`}.${component.name || index}`;
      if (
        !validateAddressesInArg(
          tupleValue[index],
          component,
          errors,
          argIndex,
          argErrors,
          componentPath,
        )
      ) {
        valid = false;
      }
    });
    return valid;
  }

  if (type === "tuple[]" && input.components) {
    if (!argValue) return true;
    try {
      const tupleArray =
        typeof argValue === "string" ? JSON.parse(argValue) : argValue;
      if (Array.isArray(tupleArray)) {
        let valid = true;
        tupleArray.forEach((tuple, index) => {
          const tuplePath = path
            ? `${path}[${index}]`
            : `${input.name || `Argument ${argIndex + 1}`}[${index}]`;
          const tupleInput = { ...input, type: "tuple" };
          if (
            !validateAddressesInArg(
              tuple,
              tupleInput,
              errors,
              argIndex,
              argErrors,
              tuplePath,
            )
          ) {
            valid = false;
          }
        });
        return valid;
      }
    } catch {
      return true;
    }
    return true;
  }

  return true;
};

export default function ContractCallerPage() {
  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <h1 className={styles.title}>Contract Caller</h1>
        <Tabs
          storageKey={TABS_STORAGE_KEY}
          newTabTitle="New Call"
          defaultTabId={DEFAULT_TAB_ID}
          renderTab={(tab, ctx) => (
            <CallerWorkspace key={tab.id} tabId={tab.id} {...ctx} />
          )}
        />
      </div>
    </main>
  );
}

function CallerWorkspace({ tabId, isActive, hydrateFromUrl, onRename }) {
  // --- Settings ---
  const {
    rpcBatchSize,
    fetchAbiConcurrency,
    apiKeys,
    rpcSettings,
    getChainId,
    customChains,
    setShowSettings,
  } = useSettings();

  // --- Per-tab persisted state ---
  const [savedTabState, setSavedTabState, tabStateLoaded] = useTabState({
    tabId,
    initial: null,
  });
  const [booted, setBooted] = useState(false);
  const restoreAppliedRef = useRef(false);

  // --- Top-level shared state ---
  const [chain, setChain] = useState("ethereum");
  const [address, setAddress] = useState("");
  const [deployMode, setDeployMode] = useState(false);
  const [savingAbiBackend, setSavingAbiBackend] = useState(false);
  const [saveAbiBackendMsg, setSaveAbiBackendMsg] = useState(null);
  const [argsExpanded, setArgsExpanded] = useState(true);

  const allChains = [...CHAINS, ...customChains];
  const nativeTokenSymbol =
    allChains.find((chainInfo) => chainInfo.id === chain)?.nativeCurrency
      ?.symbol ||
    NATIVE_TOKEN_SYMBOLS[chain] ||
    "ETH";

  // Stable callback refs to break circular hook dependencies
  const saveBundleRef = useRef(null);
  const setErrorRef = useRef(null);
  const saveToHistoryRef = useRef(null);

  const resetFunctionState = () => {
    fn.setSelectedFunction("");
    fn.setArgs([]);
    fn.setPasteCalldataValue("");
    fn.setPasteCalldataError(null);
  };

  const handleAbiParsed = (parsed, allFunctions) => {
    if (!parsed) {
      resetFunctionState();
      setErrorRef.current?.(null);
      return;
    }

    const hasSelectedFunction =
      fn.selectedFunction &&
      allFunctions.some((func) => getFunctionSig(func) === fn.selectedFunction);

    if (!hasSelectedFunction && !fn.selectedFunction) {
      resetFunctionState();
    }

    setErrorRef.current?.(null);
  };

  const handleAbiError = (message) => {
    resetFunctionState();
    setErrorRef.current?.(message);
  };

  const handleSaveAbiBackend = async () => {
    const records = abi.parsedAbi || [];
    if (records.length === 0) {
      setSaveAbiBackendMsg("No ABI loaded to save");
      return;
    }

    setSavingAbiBackend(true);
    setSaveAbiBackendMsg(null);
    try {
      const response = await fetch("/api/save-abi", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ abi: records, apiKey: apiKeys.backend }),
      });
      const data = await response.json();
      setSaveAbiBackendMsg(
        data.error || `Saved ${data.saved} of ${data.total} signatures`,
      );
    } catch (err) {
      setSaveAbiBackendMsg(err.message || "Failed to save ABI");
    } finally {
      setSavingAbiBackend(false);
    }
  };

  // --- Hooks (dependency order: simOpts → abi → fn → session → exec → history) ---

  const simOpts = useSimulationOptions();

  const abi = useAbi({
    chain,
    address,
    apiKeys,
    rpcSettings,
    fetchAbiConcurrency,
    getChainId,
    onAbiParsed: handleAbiParsed,
    onAbiError: handleAbiError,
    onSetError: (...args) => setErrorRef.current?.(...args),
  });

  const fn = useFunctionSelection({
    parsedAbi: abi.parsedAbi,
    functions: abi.functions,
    address,
  });

  const session = useTevmSession({
    chain,
    rpcUrl: rpcSettings?.[chain] || undefined,
    forkBlockNumber: simOpts.forkBlockNumber,
    rpcBatchSize,
    chainId: getChainId(chain),
    saveBundle: (...args) => saveBundleRef.current?.(...args),
    setError: (...args) => setErrorRef.current?.(...args),
  });

  const exec = useCallExecution({
    chain,
    address,
    deployMode,
    parsedAbi: abi.parsedAbi,
    selectedFunction: fn.selectedFunction,
    args: fn.args,
    rawCalldata: fn.pasteCalldataValue,
    fromAddress: simOpts.fromAddress,
    ethValue: simOpts.ethValue,
    ethValueUnit: simOpts.ethValueUnit,
    forkBlockNumber: simOpts.forkBlockNumber,
    blockNumber: fn.blockNumber,
    apiKeys,
    rpcSettings,
    rpcBatchSize,
    sessionActive: session.sessionActive,
    sessionStarting: session.sessionStarting,
    sessionClientRef: session.tevmClientRef,
    sessionBlock: session.sessionBlock,
    setSessionHistory: session.appendToSessionHistory,
    contractName: abi.contractName,
    cheatcodes: simOpts.cheatcodes,
    balanceOverrides: simOpts.balanceOverrides,
    storageOverrides: simOpts.storageOverrides,
    setFieldErrors: fn.setFieldErrors,
    getChainId,
    setCachedAddresses: abi.setCachedAddressesState,
    getCachedAddresses: abi.getCachedAddresses,
    saveToHistory: (...args) => saveToHistoryRef.current?.(...args),
    validateAddressesInArg,
  });

  // Wire the deferred callback refs now that exec is available
  setErrorRef.current = exec.setError;

  const history = useHistory({
    chain,
    address,
    selectedFunction: fn.selectedFunction,
    args: fn.args,
    fromAddress: simOpts.fromAddress,
    contractName: abi.contractName,
    getSelectedFunction: () =>
      abi.parsedAbi?.find(
        (item) =>
          item.type === "function" &&
          getFunctionSig(item) === fn.selectedFunction,
      ) || null,
    setChain,
    setAddress,
    setSelectedFunction: fn.setSelectedFunction,
    setArgs: fn.setArgs,
    setFromAddress: simOpts.setFromAddress,
    setResult: exec.setResult,
    setError: exec.setError,
    setEthValue: simOpts.setEthValue,
    setBlockNumber: fn.setBlockNumber,
    applyPendingArgs: fn.applyPendingArgs,
    skipUrlHydration: !hydrateFromUrl,
  });

  // Wire remaining deferred refs
  saveBundleRef.current = history.saveSessionBundle;
  saveToHistoryRef.current = history.saveToHistory;

  // ── URL sync: keep browser URL in sync with the active tab ──────────────
  useEffect(() => {
    if (!isActive) return;
    const currentParams = new URLSearchParams(window.location.search);
    if (currentParams.has("simulationId")) return;

    if (!address) {
      if (currentParams.has("chain") || currentParams.has("address")) {
        window.history.replaceState(null, "", window.location.pathname);
      }
      return;
    }

    const params = new URLSearchParams();
    params.set("chain", chain);
    params.set("address", address);
    if (
      fn.pasteCalldataValue &&
      fn.pasteCalldataValue.startsWith("0x") &&
      fn.pasteCalldataValue.length >= 10
    ) {
      params.set("calldata", fn.pasteCalldataValue);
    }
    if (simOpts.fromAddress) {
      params.set("from", simOpts.fromAddress);
    }
    if (simOpts.ethValue) {
      params.set("value", simOpts.ethValue);
    }
    if (fn.blockNumber) {
      params.set("block", fn.blockNumber);
    }
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?${params}`,
    );
  }, [
    isActive,
    chain,
    address,
    fn.pasteCalldataValue,
    simOpts.fromAddress,
    simOpts.ethValue,
    fn.blockNumber,
  ]);

  const tokens = useTokenMetadata(chain, rpcSettings);

  useEffect(() => {
    if (!exec.result?.simulated) return;
    // Server-side enrichment already populated _tokenMeta — no need to re-fetch
    if (exec.result._tokenMeta) return;

    const chainId = getChainId(chain);
    tokens.fetchTokenSymbolsForLogs(exec.result.logs, chainId);
    tokens.fetchTokenDataForSimulation(
      exec.result.logs,
      exec.result.balanceChanges,
      chainId,
    );
  }, [exec.result, chain, getChainId]);

  // Sync token metadata to saveExtra so it's included when saving simulation
  useEffect(() => {
    const balanceChanges = exec.result?.simulated
      ? enrichBalanceChanges({
          logs: exec.result.logs,
          balanceChanges: exec.result.balanceChanges,
          tokenSymbols: tokens.tokenSymbols,
          tokenDecimals: tokens.tokenDecimals,
          tokenPrices: tokens.tokenPrices,
          nativeTokenSymbol,
        })
      : undefined;

    exec.setSaveExtra({
      tokenSymbols: tokens.tokenSymbols,
      tokenDecimals: tokens.tokenDecimals,
      tokenPrices: tokens.tokenPrices,
      balanceChanges,
    });
  }, [
    exec.result,
    nativeTokenSymbol,
    tokens.tokenSymbols,
    tokens.tokenDecimals,
    tokens.tokenPrices,
  ]);

  const events = useEventLogs({
    chain,
    address,
    parsedAbi: abi.parsedAbi,
    apiKeys,
    getChainId,
    onMissingApiKey: () => setShowSettings(true),
  });

  const bookmark = useBookmarkModal({
    address,
    contractName: abi.contractName,
  });
  const addChain = useAddChainModal({ chain, setChain });

  // Load simulation result from query param on mount (only for the tab
  // active on page load)
  useEffect(() => {
    if (!hydrateFromUrl) return;
    const params = new URLSearchParams(window.location.search);
    const querySimulationId = params.get("simulationId");
    if (!querySimulationId) return;

    const controller = new AbortController();
    exec.setLoading(true);
    fetch(`/api/simulate-result/${encodeURIComponent(querySimulationId)}`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error("Simulation result not found or expired");
        return res.json();
      })
      .then(async (data) => {
        if (controller.signal.aborted) return;
        if (data.session === true && Array.isArray(data.results)) {
          if (data.chainId) {
            const builtInSlug = Object.keys(BUILT_IN_CHAIN_IDS).find(
              (s) => BUILT_IN_CHAIN_IDS[s] === Number(data.chainId),
            );
            if (builtInSlug) setChain(builtInSlug);
          }
          const first = data.results[data.results.length - 1];
          if (first?.requestBody) {
            const {
              to,
              from,
              value,
              functionName,
              args,
              data: calldata,
            } = first.requestBody;
            if (to) setAddress(checksumAddress(to));
            if (from) simOpts.setFromAddress(checksumAddress(from));
            if (value) simOpts.setEthValue(value);
            if (functionName && (args || calldata)) {
              fn.applyPendingArgs({
                functionSig: functionName,
                ...(args ? { args } : {}),
                ...(calldata ? { calldata } : {}),
                timestamp: Date.now(),
              });
            } else if (calldata) {
              fn.setPasteCalldataValue(calldata);
              fn.setPasteCalldataExpanded(true);
            }
          }
          const mergedMeta = { symbols: {}, decimals: {}, prices: {} };
          for (const result of data.results) {
            if (!result?._tokenMeta) continue;
            const { tokenSymbols, tokenDecimals, tokenPrices } =
              result._tokenMeta;
            if (tokenSymbols) Object.assign(mergedMeta.symbols, tokenSymbols);
            if (tokenDecimals)
              Object.assign(mergedMeta.decimals, tokenDecimals);
            if (tokenPrices) Object.assign(mergedMeta.prices, tokenPrices);
          }
          if (Object.keys(mergedMeta.symbols).length > 0)
            tokens.setTokenSymbols(mergedMeta.symbols);
          if (Object.keys(mergedMeta.decimals).length > 0)
            tokens.setTokenDecimals(mergedMeta.decimals);
          if (Object.keys(mergedMeta.prices).length > 0)
            tokens.setTokenPrices(mergedMeta.prices);
          exec.setResult(data);
          return;
        }
        if (data.requestBody) {
          const {
            chainId,
            to,
            from,
            value,
            functionName,
            args,
            data: calldata,
          } = data.requestBody;
          if (chainId) {
            const builtInSlug = Object.keys(BUILT_IN_CHAIN_IDS).find(
              (s) => BUILT_IN_CHAIN_IDS[s] === Number(chainId),
            );
            if (builtInSlug) {
              setChain(builtInSlug);
              // Decode any remaining undecoded events via signature lookup
              await decodeLogsViaServer(data.logs);
              if (data.callTrace) {
                await decodeCallTraceLogsViaServer(data.callTrace);
              }
            }
          }
          if (to) setAddress(checksumAddress(to));
          if (from) simOpts.setFromAddress(checksumAddress(from));
          if (value) simOpts.setEthValue(value);
          if (functionName && (args || calldata)) {
            fn.applyPendingArgs({
              functionSig: functionName,
              ...(args ? { args } : {}),
              ...(calldata ? { calldata } : {}),
              timestamp: Date.now(),
            });
          } else if (calldata) {
            fn.setPasteCalldataValue(calldata);
            fn.setPasteCalldataExpanded(true);
          }
        }
        if (data._tokenMeta) {
          const {
            tokenSymbols: sym,
            tokenDecimals: dec,
            tokenPrices: prices,
          } = data._tokenMeta;
          if (sym) tokens.setTokenSymbols(sym);
          if (dec) tokens.setTokenDecimals(dec);
          if (prices) tokens.setTokenPrices(prices);
        }
        exec.setResult(data);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        exec.setError(err.message);
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        exec.setLoading(false);
      });

    return () => controller.abort();
  }, [hydrateFromUrl]);

  // ── Per-tab restore / persist ──────────────────────────────────────────────
  // Keep the latest fetchAbi so a delayed auto-fetch uses the restored address.
  const fetchAbiRef = useRef(abi.fetchAbi);
  fetchAbiRef.current = abi.fetchAbi;

  // Restore persisted tab state once, after useTabState has loaded it.
  useEffect(() => {
    if (!tabStateLoaded || restoreAppliedRef.current) return;
    restoreAppliedRef.current = true;
    const s = savedTabState;
    if (s) {
      if (s.chain && s.chain !== chain) setChain(s.chain);
      if (s.address) setAddress(checksumAddress(s.address));
      if (s.selectedFunction) {
        fn.applyPendingArgs({
          functionSig: s.selectedFunction,
          args: s.args || [],
          timestamp: Date.now(),
        });
      }
      if (s.fromAddress) simOpts.setFromAddress(checksumAddress(s.fromAddress));
      if (s.ethValue) simOpts.setEthValue(s.ethValue);
      if (s.blockNumber) fn.setBlockNumber(s.blockNumber);
    }
    setBooted(true);
    if (s && !hydrateFromUrl && s.address) {
      // Non-initial tab: fetch its ABI (URL-hydrated tabs do this via
      // useHistory's URL hydration effect).
      const timer = setTimeout(() => fetchAbiRef.current(), 150);
      return () => clearTimeout(timer);
    }
  }, [tabStateLoaded]);

  // Persist core tab state (same fields that are synced to the URL).
  useEffect(() => {
    if (!booted) return;
    setSavedTabState({
      chain,
      address,
      selectedFunction: fn.selectedFunction,
      args: fn.args,
      fromAddress: simOpts.fromAddress,
      ethValue: simOpts.ethValue,
      blockNumber: fn.blockNumber,
    });
  }, [
    booted,
    chain,
    address,
    fn.selectedFunction,
    fn.args,
    simOpts.fromAddress,
    simOpts.ethValue,
    fn.blockNumber,
    setSavedTabState,
  ]);

  // Keep the tab title in sync with the loaded contract.
  const onRenameRef = useRef(onRename);
  onRenameRef.current = onRename;
  useEffect(() => {
    let title = "New Call";
    if (abi.contractName) {
      title = abi.contractName;
    } else if (address) {
      title = `${address.slice(0, 6)}…${address.slice(-4)}`;
    }
    onRenameRef.current(title);
  }, [abi.contractName, address]);

  // Derive isWrite from selected function — when no function selected, it's a native transfer (write)
  const selectedFn = abi.parsedAbi?.find(
    (item) =>
      item.type === "function" && getFunctionSig(item) === fn.selectedFunction,
  );
  const isWrite = selectedFn ? !isReadOnly(selectedFn) : true;

  // Deploy mode needs only a from address + calldata (init code); no ABI, no
  // function selector, no events. Shared block reused in both modes.
  const calldataAndOptions = (
    <>
      <CalldataSection
        expanded={fn.pasteCalldataExpanded}
        onToggle={() => fn.setPasteCalldataExpanded((v) => !v)}
        value={fn.pasteCalldataValue}
        onValueChange={fn.setPasteCalldataValue}
        error={fn.pasteCalldataError}
        onDecodeAndFill={fn.handleDecodeAndFill}
        disabled={exec.loading}
        hideDecodeAndFill={deployMode}
      />
      <SimulationOptions
        forkBlockNumber={simOpts.forkBlockNumber}
        onForkBlockChange={simOpts.setForkBlockNumber}
        fromAddress={simOpts.fromAddress}
        onFromAddressChange={simOpts.setFromAddress}
        cheatcodes={simOpts.cheatcodes}
        onCheatcodesChange={simOpts.setCheatcodes}
        balanceOverrides={simOpts.balanceOverrides}
        onBalanceOverridesChange={simOpts.setBalanceOverrides}
        storageOverrides={simOpts.storageOverrides}
        onStorageOverridesChange={simOpts.setStorageOverrides}
        fieldErrors={fn.fieldErrors}
        onOpenBookmarkModal={bookmark.openBookmarkModal}
        addressBook={bookmark.addressBook}
        disabled={exec.loading}
        ethValue={simOpts.ethValue}
        onEthValueChange={simOpts.setEthValue}
        ethValueUnit={simOpts.ethValueUnit}
        onEthValueUnitChange={simOpts.handleEthValueUnitChange}
        selectedFn={selectedFn}
        isPayable={isPayable}
      />
    </>
  );

  // --- Layout ---
  return (
    <>
      <div className={styles.form}>
        <div className={styles.row}>
          <div className={styles.networkField}>
            <label className={styles.label}>Network</label>
            <NetworkSelector
              chain={chain}
              onChainChange={setChain}
              allChains={allChains}
              onOpenAddChain={addChain.openAddChainModal}
              disabled={exec.loading}
            />
          </div>

          <div className={styles.networkField}>
            <label className={styles.label}>Mode</label>
            <div className={styles.modeToggle}>
              <button
                type="button"
                className={
                  styles.modeButton +
                  (deployMode ? "" : " " + styles.modeActive)
                }
                onClick={() => setDeployMode(false)}
                disabled={exec.loading}
              >
                Call
              </button>
              <button
                type="button"
                className={
                  styles.modeButton +
                  (deployMode ? " " + styles.modeActive : "")
                }
                onClick={() => {
                  setDeployMode(true);
                  setAddress("");
                  resetFunctionState();
                  setErrorRef.current?.(null);
                }}
                disabled={exec.loading}
              >
                Deploy
              </button>
            </div>
          </div>

          {deployMode ? (
            <div className={styles.networkField}>
              <label className={styles.label}>Deploying</label>
              <p className={styles.deployNote}>
                No target address. Paste deployment bytecode (init code) in the
                calldata field below, then simulate.
              </p>
            </div>
          ) : (
            <ContractAddressInput
              address={address}
              onAddressChange={setAddress}
              addressBook={bookmark.addressBook}
              cachedAddresses={abi.cachedAddresses}
              contractName={abi.contractName}
              onFetchAbi={abi.fetchAbi}
              onCancelFetchAbi={abi.cancelFetchAbi}
              fetchingAbi={abi.fetchingAbi}
              fetchingElapsed={abi.fetchingElapsed}
              onSaveAbiBackend={handleSaveAbiBackend}
              savingAbiBackend={savingAbiBackend}
              canSaveAbiBackend={
                (abi.parsedAbi || []).length > 0 &&
                isValidEthAddress(address) &&
                Boolean(apiKeys.backend)
              }
              saveAbiBackendMsg={saveAbiBackendMsg}
              fieldError={fn.fieldErrors.address}
              onOpenBookmarkModal={bookmark.openBookmarkModal}
              disabled={exec.loading}
            />
          )}
        </div>

        {!deployMode && (
          <AbiPanel
            abi={abi.abi}
            onAbiChange={abi.setAbi}
            parsedAbi={abi.parsedAbi}
            abiSource={abi.abiSource}
            abiSourceMeta={abi.abiSourceMeta}
            abiSaved={abi.abiSaved}
            onSaveAbi={abi.saveAbiToCache}
            onRefetchAbi={() => abi.fetchAbi({ forceRefresh: true })}
            loading={exec.loading}
          />
        )}

        {deployMode ? (
          calldataAndOptions
        ) : (
          <FunctionEventsTabs
            activeTab={events.activeTab}
            onTabChange={events.setActiveTab}
            functionsCount={abi.functions.length}
            eventsCount={
              (abi.parsedAbi || []).filter((x) => x.type === "event").length
            }
            functionsContent={
              <>
                <FunctionSelector
                  functions={abi.functions}
                  selectedFunction={fn.selectedFunction}
                  onSelectFunction={fn.setSelectedFunction}
                  disabled={exec.loading}
                />
                {calldataAndOptions}
                <ArgsInput
                  fn={selectedFn}
                  args={fn.args}
                  onArgsChange={fn.setArgs}
                  fieldErrors={fn.fieldErrors}
                  addressBook={bookmark.addressBook}
                  onOpenBookmarkModal={bookmark.openBookmarkModal}
                  blockNumber={fn.blockNumber}
                  onReadBlockNumberChange={fn.setBlockNumber}
                  disabled={exec.loading}
                  expanded={argsExpanded}
                  onToggle={() => setArgsExpanded((v) => !v)}
                />
              </>
            }
            eventsContent={
              <EventsTab
                events={(abi.parsedAbi || []).filter((x) => x.type === "event")}
                selectedEvents={events.selectedEvents}
                onToggleEvent={events.toggleEventSelection}
                onSelectAll={events.selectAllEvents}
                onClearSelection={events.clearEventSelection}
                eventFilter={events.eventFilter}
                onEventFilterChange={events.setEventFilter}
                eventListCollapsed={events.eventListCollapsed}
                onToggleEventList={() =>
                  events.setEventListCollapsed((v) => !v)
                }
                logsFromBlock={events.logsFromBlock}
                logsToBlock={events.logsToBlock}
                onLogsFromBlockChange={events.setLogsFromBlock}
                onLogsToBlockChange={events.setLogsToBlock}
                logsPage={events.logsPage}
                logsOffset={events.logsOffset}
                onLogsPageChange={events.setLogsPage}
                onLogsOffsetChange={events.setLogsOffset}
                onFetchLogs={events.fetchLogs}
                fetchingLogs={events.fetchingLogs}
                logsError={events.logsError}
                logsFetched={events.logsFetched}
                eventLogs={events.eventLogs}
                logsFilter={events.logsFilter}
                onLogsFilterChange={events.setLogsFilter}
                onDownloadCsv={events.downloadLogsAsCsv}
                latestBlock={events.latestBlockCache}
              />
            }
          />
        )}

        <CallActionBar
          address={address}
          selectedFunction={fn.selectedFunction}
          rawCalldata={fn.pasteCalldataValue}
          deployMode={deployMode}
          isWrite={isWrite}
          loading={exec.loading}
          simProgress={exec.simProgress}
          sessionActive={session.sessionActive}
          sessionBlock={session.sessionBlock}
          sessionStarting={session.sessionStarting}
          calldataCopied={fn.calldataCopied}
          urlCopied={exec.urlCopied}
          activeTab={events.activeTab}
          onCall={exec.handleCall}
          onCancel={exec.handleCancel}
          onCopyCalldata={fn.handleCopyCalldata}
          onShareUrl={exec.handleShareUrl}
          onStartSession={session.handleStartSession}
          onResetSession={session.handleResetSession}
        />

        <SessionHistoryStrip
          active={session.sessionActive}
          items={session.sessionHistory}
          expandedIds={history.expandedHistoryIds}
          onToggleExpanded={history.toggleHistoryExpanded}
        />

        <ResultPanel
          result={exec.result}
          error={exec.error}
          chain={chain}
          address={address}
          fromAddress={simOpts.fromAddress}
          tokenSymbols={tokens.tokenSymbols}
          tokenDecimals={tokens.tokenDecimals}
          tokenPrices={tokens.tokenPrices}
        />

        <HistorySidebar
          history={history.history}
          chain={chain}
          show={history.showHistory}
          onShowChange={history.setShowHistory}
          search={history.historySearch}
          onSearchChange={history.setHistorySearch}
          onLoad={history.loadFromHistory}
          onClear={history.clearHistory}
        />
      </div>

      <BookmarkModal
        open={bookmark.showBookmarkModal}
        address={bookmark.bookmarkAddress}
        label={bookmark.bookmarkLabel}
        notes={bookmark.bookmarkNotes}
        onLabelChange={bookmark.setBookmarkLabel}
        onNotesChange={bookmark.setBookmarkNotes}
        onSave={bookmark.saveBookmark}
        onRemove={bookmark.removeBookmark}
        onClose={bookmark.closeBookmarkModal}
      />

      <AddChainModal
        open={addChain.showAddChainModal}
        onClose={addChain.closeAddChainModal}
        search={addChain.chainlistSearch}
        onSearchChange={addChain.setChainlistSearch}
        customChains={customChains}
        addedCollapsed={addChain.addedChainsCollapsed}
        onToggleAddedCollapsed={() =>
          addChain.setAddedChainsCollapsed((v) => !v)
        }
        chainlistData={addChain.visibleChains}
        loading={addChain.chainlistLoading}
        error={addChain.chainlistError}
        onAddChain={addChain.addCustomChain}
        onRemoveChain={addChain.removeCustomChain}
        isChainAdded={addChain.isChainAdded}
        showTestnets={addChain.showTestnets}
        onShowTestnetsChange={addChain.setShowTestnets}
      />
    </>
  );
}
