"use client";

import { useState } from "react";
import { toEventSelector, decodeEventLog } from "viem";
import { BUILT_IN_CHAIN_IDS } from "../../utils/chains";
import { isValidEthAddress } from "../../utils/validation";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Decode a single raw Etherscan log entry using the provided ABI.
 */
function decodeLog(log, parsedAbi) {
  if (!parsedAbi) return { ...log, decodedName: null, decodedArgs: null };
  try {
    const decoded = decodeEventLog({
      abi: parsedAbi,
      data: log.data,
      topics: log.topics,
    });
    return {
      ...log,
      decodedName: decoded.eventName,
      decodedArgs: decoded.args,
    };
  } catch {
    return { ...log, decodedName: null, decodedArgs: null };
  }
}

/**
 * Build a filter evaluator function from a simple expression string.
 * Supports: field op value, joined by and/or.
 * Fields: event, args.*, topic0-3, data, block, tx.
 * Operators: =, !=, >, <, >=, <=, contains.
 */
function parseFilterExpression(expr) {
  if (!expr.trim()) return () => true;

  const tokenize = (str) => {
    const tokens = [];
    let current = "";
    let inQuote = false;
    let quoteChar = "";
    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      if ((char === '"' || char === "'") && !inQuote) {
        inQuote = true;
        quoteChar = char;
        current += char;
      } else if (char === quoteChar && inQuote) {
        inQuote = false;
        current += char;
        quoteChar = "";
      } else if (!inQuote && (char === " " || char === "\t")) {
        if (current.trim()) {
          tokens.push(current.trim());
          current = "";
        }
      } else {
        current += char;
      }
    }
    if (current.trim()) tokens.push(current.trim());
    return tokens;
  };

  const parseCondition = (tokens, startIdx) => {
    if (startIdx >= tokens.length)
      return { condition: null, nextIdx: startIdx };
    const field = tokens[startIdx];
    if (
      !field ||
      field.toLowerCase() === "and" ||
      field.toLowerCase() === "or"
    ) {
      return { condition: null, nextIdx: startIdx };
    }
    const op = tokens[startIdx + 1];
    let value = tokens[startIdx + 2];
    if (!op || !value) return { condition: null, nextIdx: startIdx + 1 };
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return {
      condition: { field: field.toLowerCase(), op: op.toLowerCase(), value },
      nextIdx: startIdx + 3,
    };
  };

  const evalCondition = (cond, log) => {
    if (!cond) return true;
    const { field, op, value } = cond;
    let logValue = null;
    if (field === "event") {
      logValue = log.decodedName || "";
    } else if (field.startsWith("args.")) {
      const argName = field.slice(5);
      if (log.decodedArgs) {
        logValue = log.decodedArgs[argName];
        if (typeof logValue === "bigint") logValue = logValue.toString();
        else if (logValue !== undefined) logValue = String(logValue);
      }
    } else if (field.startsWith("topic")) {
      const idx = parseInt(field.slice(5)) || 0;
      logValue = log.topics?.[idx] || "";
    } else if (field === "data") {
      logValue = log.data || "";
    } else if (field === "block") {
      logValue = parseInt(log.blockNumber, 16);
    } else if (field === "tx") {
      logValue = log.transactionHash || "";
    } else {
      return true;
    }
    if (logValue === null || logValue === undefined) logValue = "";
    const strValue = String(logValue).toLowerCase();
    const compareValue = String(value).toLowerCase();
    switch (op) {
      case "=":
      case "==":
        return strValue === compareValue;
      case "!=":
      case "<>":
        return strValue !== compareValue;
      case "contains":
        return strValue.includes(compareValue);
      case ">":
        return Number(logValue) > Number(value);
      case "<":
        return Number(logValue) < Number(value);
      case ">=":
        return Number(logValue) >= Number(value);
      case "<=":
        return Number(logValue) <= Number(value);
      default:
        return strValue.includes(compareValue);
    }
  };

  const tokens = tokenize(expr);
  const conditions = [];
  const operators = [];
  let idx = 0;
  while (idx < tokens.length) {
    const token = tokens[idx].toLowerCase();
    if (token === "and" || token === "or") {
      operators.push(token);
      idx++;
    } else {
      const { condition, nextIdx } = parseCondition(tokens, idx);
      if (condition) conditions.push(condition);
      idx = nextIdx;
    }
  }

  return (log) => {
    if (conditions.length === 0) return true;
    let result = evalCondition(conditions[0], log);
    for (let i = 0; i < operators.length && i + 1 < conditions.length; i++) {
      const nextResult = evalCondition(conditions[i + 1], log);
      if (operators[i] === "and") {
        result = result && nextResult;
      } else {
        result = result || nextResult;
      }
    }
    return result;
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * useEventLogs
 *
 * Manages the Events tab: event selection state, range/page params, fetch logs
 * and decode them, latest-block cache, CSV download.
 *
 * @param {object} params
 * @param {string}   params.chain       - Chain slug (e.g. "ethereum")
 * @param {string}   params.address     - Contract address
 * @param {Array}    params.parsedAbi   - Parsed ABI array (from useAbi)
 * @param {object}   params.apiKeys     - { etherscan: string, ... }
 * @param {function} params.getChainId  - (chainSlug) => numericChainId | null
 * @param {function} [params.onMissingApiKey] - called when etherscan key missing
 */
export function useEventLogs({
  chain,
  address,
  parsedAbi,
  apiKeys,
  getChainId,
  onMissingApiKey,
}) {
  // ----- state -----
  const [activeTab, setActiveTab] = useState("functions");
  const [selectedEvents, setSelectedEvents] = useState([]);
  const [eventFilter, setEventFilter] = useState("");
  const [eventLogs, setEventLogs] = useState([]);
  const [fetchingLogs, setFetchingLogs] = useState(false);
  const [logsError, setLogsError] = useState(null);
  const [logsPage, setLogsPage] = useState(1);
  const [logsOffset, setLogsOffset] = useState(1000);
  const [logsFilter, setLogsFilter] = useState("");
  const [logsFromBlock, setLogsFromBlock] = useState("");
  const [logsToBlock, setLogsToBlock] = useState("latest");
  const [latestBlockCache, setLatestBlockCache] = useState(null);
  const [logsFetched, setLogsFetched] = useState(false);
  const [eventListCollapsed, setEventListCollapsed] = useState(false);

  // ----- derived helpers (not exposed, used internally) -----

  const getEvents = () => {
    if (!parsedAbi || !Array.isArray(parsedAbi)) return [];
    return parsedAbi.filter((item) => item.type === "event");
  };

  const getFilteredEvents = () => {
    const events = getEvents();
    if (!eventFilter.trim()) return events;
    const search = eventFilter.toLowerCase();
    return events.filter(
      (event) =>
        event.name.toLowerCase().includes(search) ||
        event.inputs?.some(
          (input) =>
            input.name?.toLowerCase().includes(search) ||
            input.type?.toLowerCase().includes(search),
        ),
    );
  };

  const getFilteredLogs = () => {
    if (!logsFilter.trim()) return eventLogs;
    try {
      const evaluator = parseFilterExpression(logsFilter);
      return eventLogs.filter(evaluator);
    } catch {
      return eventLogs;
    }
  };

  // ----- callbacks -----

  const toggleEventSelection = (eventName) => {
    setSelectedEvents((prev) =>
      prev.includes(eventName)
        ? prev.filter((e) => e !== eventName)
        : [...prev, eventName],
    );
  };

  const selectAllEvents = () => {
    const filtered = getFilteredEvents();
    setSelectedEvents(filtered.map((e) => e.name));
  };

  const clearEventSelection = () => {
    setSelectedEvents([]);
  };

  const fetchLatestBlock = async () => {
    const chainIdForApi = getChainId(chain);
    if (!chainIdForApi || !apiKeys?.etherscan) return null;
    try {
      const params = new URLSearchParams({
        chainid: chainIdForApi.toString(),
        module: "proxy",
        action: "eth_blockNumber",
        apikey: apiKeys.etherscan,
      });
      const response = await fetch(`https://api.etherscan.io/v2/api?${params}`);
      const data = await response.json();
      if (data.result) {
        const blockNum = parseInt(data.result, 16);
        setLatestBlockCache(blockNum);
        return blockNum;
      }
    } catch (err) {
      console.error("Failed to fetch latest block:", err);
    }
    return null;
  };

  const fetchLogs = async () => {
    if (selectedEvents.length === 0) {
      setLogsError("Please select at least one event");
      return;
    }

    if (!address || !isValidEthAddress(address)) {
      setLogsError("Please enter a valid contract address");
      return;
    }

    if (!apiKeys?.etherscan) {
      setLogsError("Please configure your Etherscan API key in Settings");
      if (onMissingApiKey) onMissingApiKey();
      return;
    }

    setFetchingLogs(true);
    setLogsError(null);
    setEventLogs([]);

    try {
      let fromBlock = logsFromBlock.trim();
      let toBlock = logsToBlock.trim() || "latest";

      if (!fromBlock) {
        const latestBlock = latestBlockCache || (await fetchLatestBlock());
        if (latestBlock) {
          fromBlock = Math.max(0, latestBlock - 10000).toString();
        } else {
          fromBlock = "0";
        }
      }

      const allLogs = [];

      for (const eventName of selectedEvents) {
        const event = parsedAbi?.find(
          (e) => e.type === "event" && e.name === eventName,
        );
        if (!event) continue;

        const topic0 = toEventSelector(event);

        const params = new URLSearchParams({
          address,
          chain,
          topic0,
          fromBlock,
          toBlock,
          page: logsPage.toString(),
          offset: logsOffset.toString(),
        });

        if (apiKeys.etherscan) {
          params.set("etherscanApiKey", apiKeys.etherscan);
        }

        const chainIdForApi = getChainId(chain);
        if (chainIdForApi) {
          params.set("chainId", chainIdForApi.toString());
        }

        const response = await fetch(`/api/get-logs?${params}`);
        const data = await response.json();

        if (data.error) {
          throw new Error(data.error);
        }

        if (data.result && Array.isArray(data.result)) {
          allLogs.push(...data.result);
        }
      }

      allLogs.sort(
        (a, b) => parseInt(b.blockNumber, 16) - parseInt(a.blockNumber, 16),
      );

      const decodedLogs = allLogs.map((log) => decodeLog(log, parsedAbi));
      setEventLogs(decodedLogs);
      setLogsFetched(true);
    } catch (err) {
      setLogsError(err.message || "Failed to fetch logs");
    } finally {
      setFetchingLogs(false);
    }
  };

  const downloadLogsAsCsv = () => {
    const logsToExport = getFilteredLogs();
    if (logsToExport.length === 0) return;

    const headers = [
      "Block",
      "Timestamp",
      "Tx Hash",
      "Event",
      "Topics",
      "Data",
      "Decoded Args",
    ];
    const rows = logsToExport.map((log) => {
      const block = parseInt(log.blockNumber, 16);
      const timestamp = log.timeStamp
        ? new Date(parseInt(log.timeStamp, 16) * 1000).toISOString()
        : "";
      const txHash = log.transactionHash;
      const eventName = log.decodedName || "Unknown";
      const topics = log.topics?.join("; ") || "";
      const data = log.data || "";
      const decodedArgs = log.decodedArgs
        ? JSON.stringify(log.decodedArgs, (key, value) =>
            typeof value === "bigint" ? value.toString() : value,
          )
        : "";
      return [block, timestamp, txHash, eventName, topics, data, decodedArgs];
    });

    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `event_logs_${address.slice(0, 10)}_${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return {
    activeTab,
    setActiveTab,
    selectedEvents,
    toggleEventSelection,
    selectAllEvents,
    clearEventSelection,
    eventFilter,
    setEventFilter,
    eventListCollapsed,
    setEventListCollapsed,
    logsFromBlock,
    setLogsFromBlock,
    logsToBlock,
    setLogsToBlock,
    logsPage,
    setLogsPage,
    logsOffset,
    setLogsOffset,
    fetchLogs,
    fetchingLogs,
    logsError,
    logsFetched,
    eventLogs,
    logsFilter,
    setLogsFilter,
    downloadLogsAsCsv,
    latestBlockCache,
  };
}
