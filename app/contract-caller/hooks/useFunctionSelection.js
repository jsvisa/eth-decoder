"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { encodeFunctionData, decodeFunctionData } from "viem";
import {
  getDefaultArgValue,
  getFunctionSelector,
  getFunctionSig,
  normalizeInputValue,
  viemDecodedToArgValue,
} from "../utils/functionArgs";

/**
 * Manages the currently-selected function and all associated arg/calldata state.
 *
 * @param {object} params
 * @param {Array|null} params.parsedAbi  - Parsed ABI array (from useAbi or parent state).
 * @param {Array}      params.functions  - Filtered/sorted function list (from useAbi or parent).
 * @param {string}     params.address    - Current contract address (used as dependency for arg reset).
 */
export function useFunctionSelection({
  parsedAbi = null,
  functions: _functions = [],
  address = "",
} = {}) {
  const [selectedFunction, setSelectedFunction] = useState("");
  const [args, setArgs] = useState([]);
  const [functionFilter, setFunctionFilter] = useState("");
  const [showFunctionList, setShowFunctionList] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [pasteCalldataExpanded, setPasteCalldataExpanded] = useState(false);
  const [pasteCalldataValue, setPasteCalldataValue] = useState("");
  const [pasteCalldataError, setPasteCalldataError] = useState(null);
  const [ethValue, setEthValue] = useState("");
  const [ethValueUnit, setEthValueUnit] = useState("ETH");
  const [readBlockNumber, setReadBlockNumber] = useState("");
  const [copiedItem, setCopiedItem] = useState(null); // 'selector' | 'signature' | null
  const [calldataCopied, setCalldataCopied] = useState(false);

  // Tracks pending {functionSig, args, timestamp} to apply when ABI loads
  const pendingHistoryRef = useRef(null);

  // --- Effect: reset / restore args when selected function or parsedAbi changes (lines 1627-1668) ---
  useEffect(() => {
    if (!parsedAbi) {
      if (!pendingHistoryRef.current) {
        if (selectedFunction) {
          setSelectedFunction("");
        }
        setArgs([]);
        setPasteCalldataValue("");
        setPasteCalldataError(null);
      }
      return;
    }

    if (!selectedFunction) {
      if (!pendingHistoryRef.current) {
        setArgs([]);
      }
      return;
    }

    const func = parsedAbi.find(
      (item) =>
        item.type === "function" && getFunctionSig(item) === selectedFunction,
    );

    if (pendingHistoryRef.current !== null) {
      const pending = pendingHistoryRef.current;
      const pendingArgs = pending.args || [];
      const pendingFunc =
        func ||
        parsedAbi.find(
          (item) =>
            item.type === "function" &&
            (getFunctionSig(item) === pending.functionSig ||
              item.name === pending.functionSig),
        );

      if (pendingFunc) {
        const resolvedSig = getFunctionSig(pendingFunc);
        if (selectedFunction !== resolvedSig) {
          setSelectedFunction(resolvedSig);
          return;
        }

        const expectedInputs = pendingFunc.inputs?.length || 0;
        if (pendingArgs.length === expectedInputs) {
          pendingHistoryRef.current = null;
          setArgs(pendingArgs);
          return;
        }
      }
      // Still waiting for the right ABI — leave args alone
      return;
    }

    // Normal function switch: reset args to defaults
    if (!func) {
      setSelectedFunction("");
      setArgs([]);
      return;
    }

    if (func.inputs) {
      setArgs(func.inputs.map((input) => getDefaultArgValue(input)));
    } else {
      setArgs([]);
    }
  }, [selectedFunction, parsedAbi, address]);

  // --- Effect: auto-encode calldata whenever function or args change (lines 1670-1698) ---
  useEffect(() => {
    if (!selectedFunction || !parsedAbi) {
      setPasteCalldataValue("");
      return;
    }
    const func = parsedAbi.find(
      (item) =>
        item.type === "function" && getFunctionSig(item) === selectedFunction,
    );
    if (!func) return;
    try {
      const parsedArgs = func.inputs.map((input, i) =>
        normalizeInputValue(args[i], input),
      );
      const encoded = encodeFunctionData({
        abi: [func],
        functionName: func.name,
        args: parsedArgs,
      });
      setPasteCalldataValue(encoded);
    } catch {
      // args incomplete or invalid — leave current value
    }
  }, [selectedFunction, args, parsedAbi]);

  // --- Callback: decode pasted calldata and fill args (lines 2939-2983) ---
  const handleDecodeAndFill = useCallback(() => {
    const hex = pasteCalldataValue.trim();
    if (!hex || !hex.startsWith("0x") || hex.length < 10) {
      setPasteCalldataError(
        "Calldata must start with 0x followed by a 4-byte selector",
      );
      return;
    }

    const selector = hex.slice(0, 10).toLowerCase();
    const matchedFunc =
      parsedAbi?.find(
        (item) =>
          item.type === "function" && getFunctionSelector(item) === selector,
      ) ?? null;

    if (!matchedFunc) {
      setPasteCalldataError("No matching function found in ABI");
      return;
    }

    try {
      const { args: decoded } = decodeFunctionData({
        abi: [matchedFunc],
        data: hex,
      });
      const newArgs = matchedFunc.inputs.map((input, i) =>
        viemDecodedToArgValue(decoded?.[i], input),
      );
      const sig = getFunctionSig(matchedFunc);
      if (sig !== selectedFunction) {
        pendingHistoryRef.current = {
          functionSig: sig,
          args: newArgs,
          timestamp: Date.now(),
        };
        setSelectedFunction(sig);
      } else {
        setArgs(newArgs);
      }
      setPasteCalldataError(null);
    } catch {
      setPasteCalldataError("Invalid calldata");
    }
  }, [pasteCalldataValue, parsedAbi, selectedFunction]);

  // --- Callback: encode current args and copy to clipboard (lines 2985-3046) ---
  const handleCopyCalldata = useCallback(async () => {
    if (!selectedFunction || !parsedAbi) return;

    const func = parsedAbi.find(
      (item) =>
        item.type === "function" && getFunctionSig(item) === selectedFunction,
    );
    if (!func) return;

    try {
      const parsedArgs = func.inputs.map((input, index) =>
        normalizeInputValue(args[index], input),
      );

      const calldata = encodeFunctionData({
        abi: [func],
        functionName: func.name,
        args: parsedArgs,
      });

      await navigator.clipboard.writeText(calldata);
      setCalldataCopied(true);
      setTimeout(() => setCalldataCopied(false), 2000);
    } catch (err) {
      console.error("Failed to encode calldata:", err);
    }
  }, [selectedFunction, parsedAbi, args]);

  // --- Callback: apply pending args from external source (e.g. history navigation) ---
  const applyPendingArgs = useCallback(
    ({ functionSig, args: pendingArgs, timestamp } = {}) => {
      if (!functionSig) return;
      pendingHistoryRef.current = {
        functionSig,
        args: pendingArgs || [],
        timestamp: timestamp || Date.now(),
      };
      setSelectedFunction(functionSig);
    },
    [],
  );

  return {
    selectedFunction,
    setSelectedFunction,
    args,
    setArgs,
    fieldErrors,
    setFieldErrors,
    functionFilter,
    setFunctionFilter,
    showFunctionList,
    setShowFunctionList,
    pasteCalldataExpanded,
    setPasteCalldataExpanded,
    pasteCalldataValue,
    setPasteCalldataValue,
    pasteCalldataError,
    setPasteCalldataError,
    ethValue,
    setEthValue,
    ethValueUnit,
    setEthValueUnit,
    readBlockNumber,
    setReadBlockNumber,
    calldataCopied,
    copiedItem,
    setCopiedItem,
    handleDecodeAndFill,
    handleCopyCalldata,
    applyPendingArgs,
  };
}
