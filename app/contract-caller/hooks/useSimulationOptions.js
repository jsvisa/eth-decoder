"use client";

import { useState, useCallback } from "react";
import { parseEther, formatEther } from "viem";

export function useSimulationOptions() {
  const [fromAddress, setFromAddress] = useState("");
  // Single block number for both modes: read calls execute at this block,
  // write simulations fork from it. A function is either read or write, so
  // one value serves both.
  const [blockNumber, setBlockNumber] = useState("");
  const [cheatcodes, setCheatcodes] = useState({
    deal: { enabled: false, address: "", amount: "" },
    prank: { enabled: false, address: "" },
    warp: { enabled: false, timestamp: "" },
  });
  const [balanceOverrides, setBalanceOverrides] = useState([]);
  const [storageOverrides, setStorageOverrides] = useState([]);
  const [ethValue, setEthValue] = useState("");
  const [ethValueUnit, setEthValueUnit] = useState("ETH");

  const handleEthValueUnitChange = useCallback(
    (newUnit) => {
      if (newUnit === ethValueUnit) return;
      let nextValue = ethValue;
      if (ethValue && ethValue.trim() !== "") {
        try {
          nextValue =
            newUnit === "Wei"
              ? parseEther(ethValue).toString()
              : formatEther(BigInt(ethValue));
        } catch {
          nextValue = ethValue;
        }
      }
      setEthValue(nextValue);
      setEthValueUnit(newUnit);
    },
    [ethValue, ethValueUnit],
  );

  const resetWriteOptions = () => {
    setFromAddress("");
    setBlockNumber("");
    setCheatcodes({
      deal: { enabled: false, address: "", amount: "" },
      prank: { enabled: false, address: "" },
      warp: { enabled: false, timestamp: "" },
    });
    setBalanceOverrides([]);
    setStorageOverrides([]);
    setEthValue("");
    setEthValueUnit("ETH");
  };

  return {
    fromAddress,
    setFromAddress,
    blockNumber,
    setBlockNumber,
    // Backward-compatible aliases: write-mode consumers (SimulationOptions
    // fork field, tevm session) read the same single block number.
    forkBlockNumber: blockNumber,
    setForkBlockNumber: setBlockNumber,
    cheatcodes,
    setCheatcodes,
    balanceOverrides,
    setBalanceOverrides,
    storageOverrides,
    setStorageOverrides,
    ethValue,
    setEthValue,
    ethValueUnit,
    setEthValueUnit,
    handleEthValueUnitChange,
    resetWriteOptions,
  };
}
