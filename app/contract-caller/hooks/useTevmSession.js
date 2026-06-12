"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createTevmClient } from "../../utils/tevmSimulator";

/**
 * useTevmSession — local tevm session lifecycle.
 *
 * Owns: sessionActive, sessionBlock, sessionHistory, sessionStarting
 * and the tevm MemoryClient ref.
 *
 * @param {object} params
 * @param {string}   params.chain           – currently selected chain id
 * @param {string}   params.rpcUrl          – optional custom RPC URL for the chain
 * @param {string}   params.forkBlockNumber – block to fork from (empty = "latest")
 * @param {number}   params.rpcBatchSize    – RPC batch size for the tevm client
 * @param {number}   params.chainId         – numeric chain id (for custom chains)
 * @param {Function} params.saveBundle      – (sessionHistory, sessionBlock) => void
 *                                            from useHistory.saveSessionBundle
 * @param {Function} params.setError        – setter for the page-level error state
 */
export function useTevmSession({
  chain,
  rpcUrl,
  forkBlockNumber,
  rpcBatchSize = 1,
  chainId,
  saveBundle,
  setError,
}) {
  const tevmClientRef = useRef(null);
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionBlock, setSessionBlock] = useState(null);
  const [sessionHistory, setSessionHistory] = useState([]);
  const [sessionStarting, setSessionStarting] = useState(false);

  // ── Effect (lines 2270-2276): reset session when chain or fork block changes ─
  useEffect(() => {
    tevmClientRef.current = null;
    setSessionActive(false);
    setSessionBlock(null);
    setSessionHistory([]);
    if (setError) setError(null);
  }, [chain, forkBlockNumber]);

  // ── handleStartSession (lines 2219-2242) ─────────────────────────────────────
  const handleStartSession = useCallback(async () => {
    setSessionStarting(true);
    if (setError) setError(null);
    try {
      const { client, blockNumber: pinnedBlock } = await createTevmClient(
        chain,
        rpcUrl || undefined,
        forkBlockNumber || "latest",
        chainId,
        rpcBatchSize,
      );
      tevmClientRef.current = client;
      setSessionBlock(
        pinnedBlock === "latest" ? "latest" : String(pinnedBlock),
      );
      setSessionHistory([]);
      setSessionActive(true);
    } catch (err) {
      if (setError) setError(`Failed to start session: ${err.message}`);
    } finally {
      setSessionStarting(false);
    }
  }, [chain, rpcUrl, forkBlockNumber, chainId, rpcBatchSize, setError]);

  // ── handleResetSession (lines 2244-2268) ─────────────────────────────────────
  const handleResetSession = useCallback(() => {
    if (saveBundle) {
      saveBundle(sessionHistory, sessionBlock);
    }
    tevmClientRef.current = null;
    setSessionActive(false);
    setSessionBlock(null);
    setSessionHistory([]);
    if (setError) setError(null);
  }, [saveBundle, sessionHistory, sessionBlock, setError]);

  // ── appendToSessionHistory ────────────────────────────────────────────────────
  const appendToSessionHistory = useCallback((entry) => {
    setSessionHistory((prev) => [...prev, entry]);
  }, []);

  return {
    sessionActive,
    sessionBlock,
    sessionHistory,
    sessionStarting,
    tevmClientRef,
    handleStartSession,
    handleResetSession,
    appendToSessionHistory,
  };
}
