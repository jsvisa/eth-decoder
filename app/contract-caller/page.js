"use client";

import { useEffect, useState, useRef } from "react";
import { useSettings } from "../contexts/SettingsContext";
import { CHAINS, BUILT_IN_CHAIN_IDS } from "../utils/chains";
import { isValidEthAddress } from "../utils/validation";

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

const getFunctionSig = (func) => {
  const types = func.inputs?.map((input) => input.type).join(",") || "";
  return `${func.name}(${types})`;
};

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
  // --- Settings ---
  const {
    useLocalSimulation,
    rpcBatchSize,
    tenderlySettings,
    apiKeys,
    rpcSettings,
    isTenderlyConfigured,
    getChainId,
    customChains,
    setShowSettings,
  } = useSettings();

  // --- Top-level shared state ---
  const [chain, setChain] = useState("ethereum");
  const [address, setAddress] = useState("");

  const allChains = [...CHAINS, ...customChains];

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

  // --- Hooks (dependency order: simOpts → abi → fn → session → exec → history) ---

  const simOpts = useSimulationOptions();

  const abi = useAbi({
    chain,
    address,
    apiKeys,
    rpcSettings,
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
    parsedAbi: abi.parsedAbi,
    selectedFunction: fn.selectedFunction,
    args: fn.args,
    fromAddress: simOpts.fromAddress,
    ethValue: fn.ethValue,
    ethValueUnit: fn.ethValueUnit,
    forkBlockNumber: simOpts.forkBlockNumber,
    readBlockNumber: fn.readBlockNumber,
    tenderlySettings,
    apiKeys,
    rpcSettings,
    useLocalSimulation,
    rpcBatchSize,
    isTenderlyConfigured,
    sessionActive: session.sessionActive,
    sessionStarting: session.sessionStarting,
    sessionClientRef: session.tevmClientRef,
    sessionBlock: session.sessionBlock,
    setSessionHistory: session.appendToSessionHistory,
    contractName: abi.contractName,
    cheatcodes: simOpts.cheatcodes,
    balanceOverrides: simOpts.balanceOverrides,
    storageOverrides: simOpts.storageOverrides,
    timestampOverride: simOpts.timestampOverride,
    setFieldErrors: fn.setFieldErrors,
    setShowSettings,
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
    setEthValue: fn.setEthValue,
    applyPendingArgs: fn.applyPendingArgs,
  });

  // Wire remaining deferred refs
  saveBundleRef.current = history.saveSessionBundle;
  saveToHistoryRef.current = history.saveToHistory;

  const tokens = useTokenMetadata(chain, rpcSettings);

  useEffect(() => {
    if (!exec.result?.simulated) return;

    const chainId = getChainId(chain);
    tokens.fetchTokenSymbolsForLogs(exec.result.logs, chainId);
    tokens.fetchTokenDataForSimulation(
      exec.result.logs,
      exec.result.assetChanges,
      exec.result.balanceChanges,
      chainId,
    );
  }, [exec.result, chain, getChainId]);

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

  // Load simulation result from query param on mount
  useEffect(() => {
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
      .then((data) => {
        if (controller.signal.aborted) return;
        exec.setResult(data);
        if (data.requestBody) {
          const { chainId, to, from, value } = data.requestBody;
          if (chainId) {
            const builtInSlug = Object.keys(BUILT_IN_CHAIN_IDS).find(
              (s) => BUILT_IN_CHAIN_IDS[s] === Number(chainId),
            );
            if (builtInSlug) setChain(builtInSlug);
          }
          if (to) setAddress(to);
          if (from) simOpts.setFromAddress(from);
          if (value) fn.setEthValue(value);
        }
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
  }, []);

  // Derive isWrite from selected function
  const selectedFn = abi.parsedAbi?.find(
    (item) =>
      item.type === "function" && getFunctionSig(item) === fn.selectedFunction,
  );
  const isWrite =
    selectedFn?.stateMutability !== "view" &&
    selectedFn?.stateMutability !== "pure";

  // --- Layout ---
  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <h1 className={styles.title}>Contract Caller</h1>
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

            <ContractAddressInput
              address={address}
              onAddressChange={setAddress}
              addressBook={bookmark.addressBook}
              cachedAddresses={abi.cachedAddresses}
              contractName={abi.contractName}
              detectProxy={abi.detectProxy}
              onDetectProxyChange={abi.setDetectProxy}
              onFetchAbi={abi.fetchAbi}
              fetchingAbi={abi.fetchingAbi}
              fieldError={fn.fieldErrors.address}
              onOpenBookmarkModal={bookmark.openBookmarkModal}
              disabled={exec.loading}
            />
          </div>

          <AbiPanel
            abi={abi.abi}
            onAbiChange={abi.setAbi}
            parsedAbi={abi.parsedAbi}
            abiSource={abi.abiSource}
            abiSaved={abi.abiSaved}
            onSaveAbi={abi.saveAbiToCache}
            onRefetchAbi={() => abi.fetchAbi({ forceRefresh: true })}
            loading={exec.loading}
          />

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
                <CalldataSection
                  expanded={fn.pasteCalldataExpanded}
                  onToggle={() => fn.setPasteCalldataExpanded((v) => !v)}
                  value={fn.pasteCalldataValue}
                  onValueChange={fn.setPasteCalldataValue}
                  error={fn.pasteCalldataError}
                  onDecodeAndFill={fn.handleDecodeAndFill}
                  disabled={exec.loading}
                />
                <SimulationOptions
                  useLocalSimulation={useLocalSimulation}
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
                  timestampOverride={simOpts.timestampOverride}
                  onTimestampOverrideChange={simOpts.setTimestampOverride}
                  expanded={simOpts.simOptionsExpanded}
                  onToggleExpanded={() =>
                    simOpts.setSimOptionsExpanded((v) => !v)
                  }
                  fieldErrors={fn.fieldErrors}
                  onOpenBookmarkModal={bookmark.openBookmarkModal}
                  addressBook={bookmark.addressBook}
                  disabled={exec.loading}
                />
                <ArgsInput
                  fn={selectedFn}
                  args={fn.args}
                  onArgsChange={fn.setArgs}
                  fieldErrors={fn.fieldErrors}
                  addressBook={bookmark.addressBook}
                  onOpenBookmarkModal={bookmark.openBookmarkModal}
                  readBlockNumber={fn.readBlockNumber}
                  onReadBlockNumberChange={fn.setReadBlockNumber}
                  ethValue={fn.ethValue}
                  onEthValueChange={fn.setEthValue}
                  ethValueUnit={fn.ethValueUnit}
                  onEthValueUnitChange={fn.setEthValueUnit}
                  disabled={exec.loading}
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

          <CallActionBar
            selectedFunction={fn.selectedFunction}
            isWrite={isWrite}
            loading={exec.loading}
            useLocalSimulation={useLocalSimulation}
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
          chainlistData={addChain.chainlistData}
          loading={addChain.chainlistLoading}
          error={addChain.chainlistError}
          onAddChain={addChain.addCustomChain}
          onRemoveChain={addChain.removeCustomChain}
          isChainAdded={addChain.isChainAdded}
        />
      </div>
    </main>
  );
}
