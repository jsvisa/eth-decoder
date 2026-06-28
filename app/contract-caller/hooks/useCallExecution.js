"use client";

import { useState, useRef } from "react";
import yaml from "js-yaml";
import {
  simulateWithTevm,
  simulateWithClient,
  redecodeLogs,
  redecodeCallTrace,
  decodeLogsViaServer,
  decodeCallTraceLogsViaServer,
  collectAllCallAddresses,
  populateTraceToNames,
} from "../../utils/tevmSimulator";
import {
  buildAbiCacheFromStorage,
  fetchAbisForAddresses,
  getCachedAbi,
} from "../../utils/abiCache";
import {
  isValidEthAddress,
  isValidForkBlock,
  isValidNumber,
  isValidPositiveInteger,
} from "../../utils/validation";

/**
 * Manages execution of contract calls (read via /api/call-contract,
 * write via Tenderly /api/simulate, or local tevm), plus all
 * result-display toggle state.
 *
 * @param {object} params
 * @param {string}   params.chain
 * @param {string}   params.address
 * @param {Array}    params.parsedAbi
 * @param {string}   params.selectedFunction  - canonical sig e.g. "transfer(address,uint256)"
 * @param {Array}    params.args
 * @param {string}   params.fromAddress
 * @param {string}   params.ethValue
 * @param {string}   params.ethValueUnit       - "ETH" | "Wei"
 * @param {string}   params.forkBlockNumber
 * @param {string}   params.readBlockNumber
 * @param {object}   params.tenderlySettings
 * @param {object}   params.apiKeys            - { etherscan, routescan, ... }
 * @param {object}   params.rpcSettings        - chain -> rpcUrl map
 * @param {boolean}  params.useLocalSimulation
 * @param {number}   params.rpcBatchSize
 * @param {Function} params.isTenderlyConfigured
 * @param {boolean}  params.sessionActive
 * @param {boolean}  params.sessionStarting
 * @param {object}   params.sessionClientRef   - React ref holding tevm client
 * @param {string}   params.sessionBlock
 * @param {Function} params.setSessionHistory
 * @param {string}   params.contractName
 * @param {object}   params.cheatcodes         - { deal, prank, warp }
 * @param {Array}    params.balanceOverrides
 * @param {Array}    params.storageOverrides
 * @param {string}   params.timestampOverride
 * @param {Function} params.setFieldErrors
 * @param {Function} params.setShowSettings
 * @param {Function} params.getChainId          - (chain) => numericId
 * @param {Function} params.setCachedAddresses
 * @param {Function} params.getCachedAddresses
 * @param {Function} params.saveToHistory
 * @param {Function} params.validateAddressesInArg
 */
export function useCallExecution({
  chain,
  address,
  parsedAbi,
  selectedFunction,
  args,
  fromAddress,
  ethValue,
  ethValueUnit,
  forkBlockNumber,
  readBlockNumber,
  tenderlySettings,
  apiKeys,
  rpcSettings,
  useLocalSimulation,
  rpcBatchSize,
  isTenderlyConfigured,
  sessionActive,
  sessionStarting,
  sessionClientRef,
  sessionBlock,
  setSessionHistory,
  contractName,
  cheatcodes,
  balanceOverrides,
  storageOverrides,
  timestampOverride,
  setFieldErrors,
  setShowSettings,
  getChainId,
  setCachedAddresses,
  getCachedAddresses,
  saveToHistory,
  validateAddressesInArg,
} = {}) {
  // ── result/execution state ─────────────────────────────────────────────────
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [simProgress, setSimProgress] = useState(null);

  // ── result-display toggles ─────────────────────────────────────────────────
  const [isYaml, setIsYaml] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showFullResponse, setShowFullResponse] = useState(false);
  const [resultCollapsed, setResultCollapsed] = useState(false);
  const [simLogsExpanded, setSimLogsExpanded] = useState(true);
  const [bdExpandedAddrs, setBdExpandedAddrs] = useState(new Set());
  const [bdExpandedTokens, setBdExpandedTokens] = useState(new Set());
  const [hideTooltip, setHideTooltip] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);

  const simAbortRef = useRef(null);

  // ── helpers ────────────────────────────────────────────────────────────────

  const isReadOnly = (func) =>
    func?.stateMutability === "view" || func?.stateMutability === "pure";

  const isPayable = (func) => func?.stateMutability === "payable";

  const getSelectedFunction = () => {
    if (!selectedFunction || !parsedAbi) return null;
    return parsedAbi.find(
      (item) =>
        item.type === "function" && getFunctionSig(item) === selectedFunction,
    );
  };

  const getFunctionSig = (func) => {
    const types = func.inputs?.map((i) => i.type).join(",") || "";
    return `${func.name}(${types})`;
  };

  const getEthValueWithUnit = () => {
    if (!ethValue || ethValue.trim() === "")
      return { value: undefined, unit: "ETH" };
    try {
      if (ethValueUnit === "Wei") {
        BigInt(ethValue);
      } else {
        parseFloat(ethValue);
      }
    } catch {
      return { value: undefined, unit: ethValueUnit };
    }
    return { value: ethValue, unit: ethValueUnit };
  };

  // ── handleCall ─────────────────────────────────────────────────────────────

  const handleCall = async () => {
    if (typeof setFieldErrors === "function") setFieldErrors({});

    if (!address || !selectedFunction || !parsedAbi) {
      const errors = {};
      if (!address || !isValidEthAddress(address)) errors.address = true;
      if (typeof setFieldErrors === "function") setFieldErrors(errors);
      setError("Please fill in all required fields");
      return;
    }

    const selectedFunc = getSelectedFunction();
    const isWrite = !isReadOnly(selectedFunc);

    if (isWrite && !useLocalSimulation && !isTenderlyConfigured?.()) {
      setError(
        "Please configure Tenderly API settings or enable Local Simulation to simulate write functions",
      );
      if (typeof setShowSettings === "function") setShowSettings(true);
      return;
    }

    // ── validation ────────────────────────────────────────────────────────────
    const errors = {};

    if (!isValidEthAddress(address)) {
      errors.address = true;
    }

    if (isWrite && !isValidEthAddress(fromAddress)) {
      errors.fromAddress = true;
    }

    if (isWrite && forkBlockNumber && !isValidForkBlock(forkBlockNumber)) {
      errors.forkBlockNumber = true;
    }

    if (
      selectedFunc &&
      isPayable(selectedFunc) &&
      ethValue &&
      !isValidNumber(ethValue)
    ) {
      errors.ethValue = true;
    }

    if (isWrite && useLocalSimulation && cheatcodes) {
      if (cheatcodes.deal?.enabled) {
        if (
          cheatcodes.deal.address &&
          !isValidEthAddress(cheatcodes.deal.address)
        ) {
          errors.dealAddress = true;
        }
        if (cheatcodes.deal.amount && !isValidNumber(cheatcodes.deal.amount)) {
          errors.dealAmount = true;
        }
      }
      if (
        cheatcodes.prank?.enabled &&
        cheatcodes.prank.address &&
        !isValidEthAddress(cheatcodes.prank.address)
      ) {
        errors.prankAddress = true;
      }
      if (
        cheatcodes.warp?.enabled &&
        cheatcodes.warp.timestamp &&
        !isValidPositiveInteger(cheatcodes.warp.timestamp)
      ) {
        errors.warpTimestamp = true;
      }
    }

    if (selectedFunc?.inputs && typeof validateAddressesInArg === "function") {
      const argErrors = [];
      selectedFunc.inputs.forEach((input, index) => {
        const argValue = args[index];
        validateAddressesInArg(argValue, input, errors, index, argErrors);
      });
      if (argErrors.length > 0) {
        errors.argErrors = argErrors;
      }
    }

    if (Object.keys(errors).length > 0) {
      if (typeof setFieldErrors === "function") setFieldErrors(errors);
      const errorMessages = [];
      if (errors.address)
        errorMessages.push("Contract Address must be a valid Ethereum address");
      if (errors.fromAddress)
        errorMessages.push("From Address must be a valid Ethereum address");
      if (errors.forkBlockNumber)
        errorMessages.push(
          'Fork Block must be empty, "latest", or a valid block number',
        );
      if (errors.ethValue)
        errorMessages.push("ETH Value must be a valid number");
      if (errors.dealAddress)
        errorMessages.push("Deal address must be a valid Ethereum address");
      if (errors.dealAmount)
        errorMessages.push("Deal amount must be a valid number");
      if (errors.prankAddress)
        errorMessages.push("Prank address must be a valid Ethereum address");
      if (errors.warpTimestamp)
        errorMessages.push("Warp timestamp must be a valid positive integer");
      if (errors.argErrors) errorMessages.push(...errors.argErrors);
      setError(errorMessages.join("; "));
      return;
    }

    if (sessionStarting) {
      setError("Session is still starting, please wait");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      let data;

      if (useLocalSimulation && (isWrite || sessionActive)) {
        const activeCheatcodes = {};
        if (
          cheatcodes?.deal?.enabled &&
          cheatcodes.deal.address &&
          cheatcodes.deal.amount
        ) {
          activeCheatcodes.deal = {
            address: cheatcodes.deal.address,
            amount: cheatcodes.deal.amount,
          };
        }
        if (cheatcodes?.prank?.enabled && cheatcodes.prank.address) {
          activeCheatcodes.prank = { address: cheatcodes.prank.address };
        }
        if (cheatcodes?.warp?.enabled && cheatcodes.warp.timestamp) {
          activeCheatcodes.warp = {
            timestamp: parseInt(cheatcodes.warp.timestamp),
          };
        }

        const ethValueInfo = getEthValueWithUnit();
        const chainIdForSimulation = getChainId?.(chain);

        const initialAbiCache = buildAbiCacheFromStorage(chain);
        initialAbiCache.set(address.toLowerCase(), parsedAbi);

        const abortController = new AbortController();
        simAbortRef.current?.abort();
        simAbortRef.current = abortController;
        setSimProgress(0);

        const simParams = {
          chain,
          address,
          functionName: selectedFunction,
          args,
          abi: parsedAbi,
          fromAddress: fromAddress || undefined,
          value: ethValueInfo.value,
          valueUnit: ethValueInfo.unit,
          rpcUrl: rpcSettings?.[chain] || undefined,
          blockNumber: forkBlockNumber || "latest",
          cheatcodes: activeCheatcodes,
          customChainId: chainIdForSimulation,
          abiCache: initialAbiCache,
          onProgress: (pct) => setSimProgress(pct),
          abortSignal: abortController.signal,
          rpcBatchSize,
        };

        if (sessionActive && sessionClientRef?.current) {
          data = await simulateWithClient(
            sessionClientRef.current,
            sessionBlock,
            { ...simParams, persistState: isWrite },
          );
        } else {
          data = await simulateWithTevm(simParams);
        }
        setSimProgress(100);

        if (sessionActive) {
          const ts = Date.now();
          if (typeof setSessionHistory === "function") {
            setSessionHistory((prev) => [
              ...prev,
              {
                id: ts,
                address,
                contractName: contractName || address.slice(0, 8) + "...",
                functionName: selectedFunction,
                type: isWrite ? "write" : "read",
                success: data.success,
                inputs: data.callTrace?.decodedInputs || [],
                outputs: data.decoded || [],
                timestamp: ts,
                metrics: data.metrics ?? null,
              },
            ]);
          }
        }

        if (data.undecodedAddresses && data.undecodedAddresses.length > 0) {
          const addressesToFetch = data.undecodedAddresses.filter(
            (addr) => !initialAbiCache.has(addr.toLowerCase()),
          );

          if (addressesToFetch.length > 0) {
            const newAbis = await fetchAbisForAddresses(
              chain,
              addressesToFetch,
              apiKeys?.etherscan,
              rpcSettings?.[chain],
              chainIdForSimulation,
              apiKeys?.routescan,
            );

            for (const [addr, abi] of newAbis) {
              initialAbiCache.set(addr, abi);
            }

            if (newAbis.size > 0) {
              data.logs = redecodeLogs(data.logs, initialAbiCache);
              if (data.callTrace) {
                data.callTrace = redecodeCallTrace(
                  data.callTrace,
                  initialAbiCache,
                );
                data.logs = redecodeLogs(data.logs, initialAbiCache);
              }
            }
          }
        }

        // Fetch ABIs for ALL call trace addresses (not just undecoded ones)
        // so that contract labels appear on inner call frames.
        if (data.callTrace) {
          const allTraceAddrs = collectAllCallAddresses(data.callTrace);
          const uncachedAddrs = [...allTraceAddrs].filter(
            (addr) => !initialAbiCache.has(addr),
          );
          if (uncachedAddrs.length > 0) {
            const newAbis = await fetchAbisForAddresses(
              chain,
              uncachedAddrs,
              apiKeys?.etherscan,
              rpcSettings?.[chain],
              chainIdForSimulation,
              apiKeys?.routescan,
            );
            for (const [addr, abi] of newAbis) {
              initialAbiCache.set(addr, abi);
            }
            if (newAbis.size > 0) {
              if (data.callTrace) {
                data.callTrace = redecodeCallTrace(
                  data.callTrace,
                  initialAbiCache,
                );
              }
              data.logs = redecodeLogs(data.logs, initialAbiCache);
            }
          }
          // Populate toName on every trace node using the now-cached names
          populateTraceToNames(data.callTrace, (addr) => {
            const cached = getCachedAbi(chain, addr);
            return cached
              ? cached.implContractName || cached.contractName || null
              : null;
          });
        }

        await decodeLogsViaServer(data.logs);
        if (data.callTrace) {
          await decodeCallTraceLogsViaServer(data.callTrace);
        }

        if (
          typeof setCachedAddresses === "function" &&
          typeof getCachedAddresses === "function"
        ) {
          setCachedAddresses(getCachedAddresses());
        }
      } else {
        const apiEndpoint = isWrite ? "/api/simulate" : "/api/call-contract";

        const requestBody = {
          chain,
          address,
          functionName: selectedFunction,
          args,
          abi: parsedAbi,
        };

        const chainIdForApi = getChainId?.(chain);
        if (chainIdForApi) {
          requestBody.chainId = chainIdForApi;
        }

        if (rpcSettings?.[chain]) {
          requestBody.rpcUrl = rpcSettings[chain];
        }

        if (!isWrite && readBlockNumber) {
          requestBody.blockNumber = readBlockNumber;
        }

        if (isWrite) {
          requestBody.fromAddress = fromAddress || undefined;
          requestBody.tenderlyAccessKey = tenderlySettings?.accessKey;
          requestBody.tenderlyAccount = tenderlySettings?.account;
          requestBody.tenderlyProject = tenderlySettings?.project;
          if (forkBlockNumber) {
            requestBody.blockNumber = forkBlockNumber;
          }
          const ethValueInfo = getEthValueWithUnit();
          if (ethValueInfo.value) {
            requestBody.value = ethValueInfo.value;
            requestBody.valueUnit = ethValueInfo.unit;
          }
          if (balanceOverrides?.length > 0 || storageOverrides?.length > 0) {
            requestBody.stateOverrides = {};
            if (balanceOverrides?.length > 0) {
              requestBody.stateOverrides.balances = balanceOverrides.filter(
                (o) => o.address && o.balance,
              );
            }
            if (storageOverrides?.length > 0) {
              requestBody.stateOverrides.storage = storageOverrides.filter(
                (o) => o.address && o.slot && o.value,
              );
            }
          }
          if (timestampOverride) {
            requestBody.blockHeaderOverrides = { timestamp: timestampOverride };
          }
        }

        const abortController = new AbortController();
        simAbortRef.current?.abort();
        simAbortRef.current = abortController;

        const response = await fetch(apiEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
          signal: abortController.signal,
        });

        data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to call contract");
        }
      }

      if (isWrite && data.success === false) {
        setError(data.error || "Simulation failed: transaction would revert");
        setResult(data);
      } else {
        setResult(data);
      }

      setSimLogsExpanded(!data.logs || data.logs.length <= 10);

      if (typeof saveToHistory === "function") {
        saveToHistory(
          { chain, address, selectedFunction, args },
          data,
          isWrite,
        );
      }
    } catch (err) {
      if (err.name === "AbortError" || err.message === "Simulation cancelled") {
        setError(null);
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
      setSimProgress(null);
      simAbortRef.current = null;
    }
  };

  // ── handleCancel ───────────────────────────────────────────────────────────

  const handleCancel = () => {
    simAbortRef.current?.abort();
  };

  // ── handleCopy ─────────────────────────────────────────────────────────────

  const handleCopy = async () => {
    try {
      const text = isYaml
        ? yaml.dump(result, { indent: 2, lineWidth: -1, noRefs: true })
        : JSON.stringify(result, null, 2);

      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  // ── handleShareUrl ─────────────────────────────────────────────────────────

  const handleShareUrl = async () => {
    try {
      const params = new URLSearchParams();
      params.set("chain", chain);
      params.set("address", address);

      if (selectedFunction) {
        params.set("function", selectedFunction);
      }

      if (args?.length > 0 && args.some((a) => a !== "")) {
        params.set("args", JSON.stringify(args));
      }

      if (fromAddress) {
        params.set("from", fromAddress);
      }

      if (ethValue) {
        params.set("value", ethValue);
      }

      const shareUrl = `${window.location.origin}${window.location.pathname}?${params}`;

      await navigator.clipboard.writeText(shareUrl);
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy share URL:", err);
    }
  };

  // ── return ─────────────────────────────────────────────────────────────────

  return {
    result,
    setResult,
    error,
    setError,
    loading,
    simProgress,
    isYaml,
    setIsYaml,
    copied,
    showFullResponse,
    setShowFullResponse,
    resultCollapsed,
    setResultCollapsed,
    simLogsExpanded,
    setSimLogsExpanded,
    bdExpandedAddrs,
    setBdExpandedAddrs,
    bdExpandedTokens,
    setBdExpandedTokens,
    hideTooltip,
    setHideTooltip,
    urlCopied,
    handleCall,
    handleCancel,
    handleCopy,
    handleShareUrl,
  };
}
