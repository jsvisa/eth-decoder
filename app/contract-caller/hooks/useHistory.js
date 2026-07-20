"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { CHAINS, BUILT_IN_CHAIN_IDS } from "../../utils/chains";

const STORAGE_KEY = "contract_caller_history";
const CUSTOM_CHAINS_KEY = "custom_chains";
const MAX_HISTORY_ITEMS = 50;

/**
 * useHistory — persisted call history with URL sync.
 *
 * @param {object} params
 * @param {string}   params.chain             – currently selected chain id
 * @param {string}   params.address           – currently entered contract address
 * @param {string}   params.selectedFunction  – currently selected function sig
 * @param {Array}    params.args              – current function args
 * @param {string}   params.fromAddress       – current "from" address
 * @param {string}   params.contractName      – name of the loaded contract
 * @param {Function} params.getSelectedFunction – () => ABI function object | null
 * @param {Function} params.setChain          – setter for chain
 * @param {Function} params.setAddress        – setter for address
 * @param {Function} params.setSelectedFunction – setter for selectedFunction
 * @param {Function} params.setArgs           – setter for args
 * @param {Function} params.setFromAddress    – setter for fromAddress
 * @param {Function} params.setResult         – setter for result panel
 * @param {Function} params.setError          – setter for error state
 * @param {Function} params.setEthValue         – setter for ETH value input
 * @param {Function} params.setBlockNumber  – setter for read block number
 * @param {Function} params.applyPendingArgs    – queue pending function/args in selection state
 */
export function useHistory({
  chain,
  address,
  selectedFunction,
  args,
  fromAddress,
  contractName,
  getSelectedFunction,
  setChain,
  setAddress,
  setSelectedFunction,
  setArgs,
  setFromAddress,
  setResult,
  setError,
  setEthValue,
  setBlockNumber,
  applyPendingArgs,
}) {
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(true);
  const [historySearch, setHistorySearch] = useState("");
  const [expandedHistoryIds, setExpandedHistoryIds] = useState(new Set());

  // Store pending args to handle race conditions when switching contracts.
  // Shape: { functionSig, args, timestamp }
  const pendingHistoryRef = useRef(null);

  // ── Effect 1 (lines 840-852): clear stale pending history after 5 s ──────
  useEffect(() => {
    if (pendingHistoryRef.current && pendingHistoryRef.current.timestamp) {
      const timer = setTimeout(() => {
        if (
          pendingHistoryRef.current &&
          Date.now() - pendingHistoryRef.current.timestamp > 5000
        ) {
          pendingHistoryRef.current = null;
        }
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [pendingHistoryRef.current?.timestamp]);

  // ── Effect 2 (lines 1391-1419): load history from localStorage on mount ──
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setHistory(JSON.parse(stored));
      }
    } catch (err) {
      console.error("Failed to load history:", err);
    }
  }, []);

  // ── Effect 3 (lines 1422-1505): hydrate from URL params on mount ─────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlChain = params.get("chain");
    const urlAddress = params.get("address");
    const urlFunction = params.get("function");
    const urlArgs = params.get("args");
    const urlFrom = params.get("from");
    const urlValue = params.get("value");
    const urlBlock = params.get("block");

    if (urlChain) {
      let resolvedChain = urlChain;
      const isBuiltIn = CHAINS.some((c) => c.id === urlChain);
      let isCustom = false;
      let savedParsedChains = [];
      try {
        const savedCustomChains = localStorage.getItem(CUSTOM_CHAINS_KEY);
        if (savedCustomChains) {
          savedParsedChains = JSON.parse(savedCustomChains);
          isCustom = savedParsedChains.some((c) => c.id === urlChain);
        }
      } catch (e) {}

      if (!isBuiltIn && !isCustom) {
        const numericId = parseInt(urlChain, 10);
        if (!isNaN(numericId) && String(numericId) === urlChain) {
          const builtInEntry = Object.entries(BUILT_IN_CHAIN_IDS).find(
            ([, id]) => id === numericId,
          );
          if (builtInEntry) {
            resolvedChain = builtInEntry[0];
          } else {
            const customMatch = savedParsedChains.find(
              (c) => c.chainId === numericId,
            );
            if (customMatch) resolvedChain = customMatch.id;
          }
        }
      }

      if (resolvedChain !== urlChain || isBuiltIn || isCustom) {
        setChain(resolvedChain);
      }
    }

    if (urlAddress) {
      setAddress(urlAddress);

      if (urlFunction) {
        let parsedArgs = [];
        if (urlArgs) {
          try {
            parsedArgs = JSON.parse(urlArgs);
          } catch (e) {
            console.error("Failed to parse URL args:", e);
          }
        }

        const pendingSelection = {
          functionSig: urlFunction,
          args: parsedArgs,
          timestamp: Date.now(),
        };
        pendingHistoryRef.current = pendingSelection;
        if (typeof applyPendingArgs === "function") {
          applyPendingArgs(pendingSelection);
        }
      }

      if (urlFrom) {
        setFromAddress(urlFrom);
      }

      if (urlValue) {
        setEthValue(urlValue);
      }

      if (urlBlock) {
        setBlockNumber?.(urlBlock);
      }

      // Auto-fetch ABI after a short delay
      const timer = setTimeout(() => {
        const fetchButton = document.querySelector("[data-fetch-abi]");
        if (fetchButton) {
          fetchButton.click();
        }
      }, 200);
      return () => clearTimeout(timer);
    }
  }, []);

  // ── Callback: toggleHistoryExpanded ──────────────────────────────────────
  const toggleHistoryExpanded = useCallback((id) => {
    setExpandedHistoryIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  // ── Callback: saveToHistory (lines 1967-2018) ─────────────────────────────
  const saveToHistory = useCallback(
    (callData, output, isWrite) => {
      const callKey = `${chain}-${address.toLowerCase()}-${selectedFunction}-${JSON.stringify(args)}`;

      const existingIndex = history.findIndex((item) => {
        const itemKey = `${item.chain}-${item.address.toLowerCase()}-${item.functionSig || item.functionName}-${JSON.stringify(item.args)}`;
        return itemKey === callKey;
      });

      const func = getSelectedFunction();
      let newHistory;
      if (existingIndex !== -1) {
        const updatedItem = {
          ...history[existingIndex],
          fromAddress,
          output,
          isWrite,
          timestamp: new Date().toISOString(),
        };
        newHistory = [
          updatedItem,
          ...history.slice(0, existingIndex),
          ...history.slice(existingIndex + 1),
        ];
      } else {
        const historyItem = {
          id: Date.now(),
          chain,
          address,
          functionName: func?.name || selectedFunction,
          functionSig: selectedFunction,
          args: [...args],
          fromAddress,
          output,
          contractName,
          isWrite,
          timestamp: new Date().toISOString(),
        };
        newHistory = [historyItem, ...history].slice(0, MAX_HISTORY_ITEMS);
      }

      setHistory(newHistory);

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory));
      } catch (err) {
        console.error("Failed to save history:", err);
      }
    },
    [
      chain,
      address,
      selectedFunction,
      args,
      fromAddress,
      contractName,
      history,
      getSelectedFunction,
    ],
  );

  // ── Callback: saveSessionBundle (from handleResetSession lines 2244-2268) ─
  const saveSessionBundle = useCallback(
    (sessionHistory, sessionBlock) => {
      if (sessionHistory.length === 0) return;
      const bundle = {
        id: Date.now(),
        type: "session",
        chain,
        block: sessionBlock,
        txs: [...sessionHistory],
        timestamp: new Date().toISOString(),
      };
      const newHistory = [bundle, ...history].slice(0, MAX_HISTORY_ITEMS);
      setHistory(newHistory);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory));
      } catch (err) {
        console.error("Failed to save session bundle:", err);
      }
    },
    [chain, history],
  );

  // ── Callback: loadFromHistory (lines 2020-2052) ───────────────────────────
  const loadFromHistory = useCallback(
    (item) => {
      const historyArgs = item.args || [];
      const itemSig = item.functionSig || item.functionName;
      const sameContract =
        address &&
        item.address &&
        address.toLowerCase() === item.address.toLowerCase();
      const sameFunction = selectedFunction === itemSig;

      if (sameContract && sameFunction) {
        setArgs(historyArgs);
        setChain(item.chain);
        setFromAddress(item.fromAddress || "");
        setResult(item.output);
        setError(null);
        return;
      }

      const pendingSelection = {
        functionSig: itemSig,
        args: historyArgs,
        timestamp: Date.now(),
      };
      pendingHistoryRef.current = pendingSelection;
      if (typeof applyPendingArgs === "function") {
        applyPendingArgs(pendingSelection);
      }

      setChain(item.chain);
      setAddress(item.address);
      setFromAddress(item.fromAddress || "");
      setSelectedFunction(itemSig);
      setResult(item.output);
      setError(null);
    },
    [
      address,
      selectedFunction,
      setArgs,
      setChain,
      setFromAddress,
      setResult,
      setError,
      setAddress,
      setSelectedFunction,
      applyPendingArgs,
    ],
  );

  // ── Callback: clearHistory (lines 2054-2064) ──────────────────────────────
  const clearHistory = useCallback(() => {
    if (!window.confirm("Are you sure you want to clear all history?")) {
      return;
    }
    setHistory([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.error("Failed to clear history:", err);
    }
  }, []);

  // ── Callback: consumePendingArgs ──────────────────────────────────────────
  // Consumers (e.g. the ABI-load effect) call this to retrieve and clear the
  // pending function/args set by URL hydration or loadFromHistory.
  const consumePendingArgs = useCallback(() => {
    const pending = pendingHistoryRef.current;
    if (!pending) return null;
    pendingHistoryRef.current = null;
    return pending;
  }, []);

  return {
    history,
    showHistory,
    setShowHistory,
    historySearch,
    setHistorySearch,
    expandedHistoryIds,
    toggleHistoryExpanded,
    saveToHistory,
    saveSessionBundle,
    loadFromHistory,
    clearHistory,
    pendingHistoryRef,
    consumePendingArgs,
  };
}
