"use client";

import { useState } from "react";

/**
 * Owns write-mode simulation knobs: from address, fork block, cheatcodes
 * (local tevm), balance/storage/timestamp overrides (Tenderly), and the
 * options-section expanded flag.
 *
 * No effects are required — all state is purely local.
 */
export function useSimulationOptions() {
  const [fromAddress, setFromAddress] = useState("");
  const [forkBlockNumber, setForkBlockNumber] = useState("");
  const [cheatcodes, setCheatcodes] = useState({
    deal: { enabled: false, address: "", amount: "" },
    prank: { enabled: false, address: "" },
    warp: { enabled: false, timestamp: "" },
  });
  // Tenderly-specific state overrides
  const [balanceOverrides, setBalanceOverrides] = useState([]); // Array of {address, balance}
  const [storageOverrides, setStorageOverrides] = useState([]); // Array of {address, slot, value}
  const [timestampOverride, setTimestampOverride] = useState(""); // Unix timestamp override
  const [simOptionsExpanded, setSimOptionsExpanded] = useState(false);

  // Reset all write-mode simulation options to their initial defaults.
  // Useful when switching chains, contracts, or functions.
  const resetWriteOptions = () => {
    setFromAddress("");
    setForkBlockNumber("");
    setCheatcodes({
      deal: { enabled: false, address: "", amount: "" },
      prank: { enabled: false, address: "" },
      warp: { enabled: false, timestamp: "" },
    });
    setBalanceOverrides([]);
    setStorageOverrides([]);
    setTimestampOverride("");
    setSimOptionsExpanded(false);
  };

  return {
    fromAddress,
    setFromAddress,
    forkBlockNumber,
    setForkBlockNumber,
    cheatcodes,
    setCheatcodes,
    balanceOverrides,
    setBalanceOverrides,
    storageOverrides,
    setStorageOverrides,
    timestampOverride,
    setTimestampOverride,
    simOptionsExpanded,
    setSimOptionsExpanded,
    resetWriteOptions,
  };
}
