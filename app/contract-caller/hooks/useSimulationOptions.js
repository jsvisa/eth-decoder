"use client";

import { useState } from "react";

/**
 * Owns write-mode simulation knobs: from address, fork block, cheatcodes,
 * and the options-section expanded flag.
 */
export function useSimulationOptions() {
  const [fromAddress, setFromAddress] = useState("");
  const [forkBlockNumber, setForkBlockNumber] = useState("");
  const [cheatcodes, setCheatcodes] = useState({
    deal: { enabled: false, address: "", amount: "" },
    prank: { enabled: false, address: "" },
    warp: { enabled: false, timestamp: "" },
  });
  const [simOptionsExpanded, setSimOptionsExpanded] = useState(false);

  // Reset all write-mode simulation options to their initial defaults.
  const resetWriteOptions = () => {
    setFromAddress("");
    setForkBlockNumber("");
    setCheatcodes({
      deal: { enabled: false, address: "", amount: "" },
      prank: { enabled: false, address: "" },
      warp: { enabled: false, timestamp: "" },
    });
    setSimOptionsExpanded(false);
  };

  return {
    fromAddress,
    setFromAddress,
    forkBlockNumber,
    setForkBlockNumber,
    cheatcodes,
    setCheatcodes,
    simOptionsExpanded,
    setSimOptionsExpanded,
    resetWriteOptions,
  };
}
