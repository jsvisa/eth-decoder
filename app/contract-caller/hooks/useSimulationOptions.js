"use client";

import { useState, useCallback } from "react";
import { parseEther, formatEther } from "viem";

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
    setForkBlockNumber("");
    setCheatcodes({
      deal: { enabled: false, address: "", amount: "" },
      prank: { enabled: false, address: "" },
      warp: { enabled: false, timestamp: "" },
    });
    setBalanceOverrides([]);
    setStorageOverrides([]);
    setSimOptionsExpanded(false);
    setEthValue("");
    setEthValueUnit("ETH");
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
    ethValue,
    setEthValue,
    ethValueUnit,
    setEthValueUnit,
    handleEthValueUnitChange,
    resetWriteOptions,
  };
}
