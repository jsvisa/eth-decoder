"use client";

import { useState } from "react";

/**
 * Owns write-mode simulation knobs: from address, fork block, cheatcodes,
 * state overrides, and the options-section expanded flag.
 */
export function useSimulationOptions() {
  const [fromAddress, setFromAddress] = useState("");
  const [forkBlockNumber, setForkBlockNumber] = useState("");
  const [cheatcodes, setCheatcodes] = useState({
    deal: { enabled: false, address: "", amount: "" },
    prank: { enabled: false, address: "" },
    warp: { enabled: false, timestamp: "" },
  });
  const [balanceOverrides, setBalanceOverrides] = useState([]);
  const [storageOverrides, setStorageOverrides] = useState([]);
  const [simOptionsExpanded, setSimOptionsExpanded] = useState(false);

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
    simOptionsExpanded,
    setSimOptionsExpanded,
    resetWriteOptions,
  };
}
