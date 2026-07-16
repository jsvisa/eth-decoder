"use client";

import { useState } from "react";
import yaml from "js-yaml";
import { formatEther } from "viem";
import { formatTokenAmount } from "../../utils/tokenFormatting";
import {
  NATIVE_TOKEN_ADDRESS,
  NATIVE_TOKEN_SYMBOLS,
  enrichBalanceChanges,
} from "../../utils/balanceChanges";
import { CHAINS } from "../../utils/chains";
import styles from "./ResultPanel.module.css";
import MetricsPanel from "./MetricsPanel";
import SimulatedEventLogs from "./SimulatedEventLogs";
import { getBookmarkedAddress } from "../../utils/addressBook";
import { getCachedAbi } from "../../utils/abiCache";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOKEN_SYMBOL_CACHE_PREFIX = "token-symbol-";
const TOKEN_DECIMALS_CACHE_PREFIX = "token-decimals-";

const BUILT_IN_EXPLORER_URLS = {
  ethereum: "https://etherscan.io",
  arbitrum: "https://arbiscan.io",
  base: "https://basescan.org",
  polygon: "https://polygonscan.com",
  bsc: "https://bscscan.com",
};

// ---------------------------------------------------------------------------
// Local helpers (localStorage-backed, safe to call server-side — they guard
// with try/catch and return null when localStorage is unavailable).
// ---------------------------------------------------------------------------

function getContractNameFromCache(chain, address) {
  if (!address) return null;
  const cached = getCachedAbi(chain, address);
  if (!cached) return null;
  return cached.implContractName || cached.contractName || null;
}

function resolveAddressName(chain, addr) {
  if (!addr) return null;
  const cached = getContractNameFromCache(chain, addr);
  if (cached) return cached;
  const entry = getBookmarkedAddress(addr);
  return entry?.label || entry?.contractName || null;
}

function getCachedTokenSymbol(chain, address) {
  if (!address) return null;
  try {
    const key = `${TOKEN_SYMBOL_CACHE_PREFIX}${chain}-${address.toLowerCase()}`;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function getCachedTokenDecimals(chain, address) {
  if (!address) return null;
  try {
    const key = `${TOKEN_DECIMALS_CACHE_PREFIX}${chain}-${address.toLowerCase()}`;
    const val = localStorage.getItem(key);
    return val !== null ? Number(val) : null;
  } catch {
    return null;
  }
}

function parseBigIntOrNull(value) {
  try {
    return BigInt(String(value));
  } catch {
    return null;
  }
}

function formatNativeWhole(value) {
  const parsed = parseBigIntOrNull(value);
  return parsed === null ? "?" : (parsed / BigInt(10 ** 18)).toString();
}

function isNonNegativeBigInt(value) {
  const parsed = parseBigIntOrNull(value);
  return parsed !== null && parsed >= 0n;
}

function getCustomChains() {
  try {
    const raw = localStorage.getItem("custom_chains");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function buildExplorerAddressUrl(chain, address) {
  if (!address) return null;
  const builtIn = BUILT_IN_EXPLORER_URLS[chain];
  if (builtIn) return `${builtIn}/address/${address}`;
  const customChains = getCustomChains();
  const allChains = [...CHAINS, ...customChains];
  const chainInfo = allChains.find((c) => c.id === chain) || null;
  const explorer = chainInfo?.explorers?.[0];
  if (explorer?.url) return `${explorer.url}/address/${address}`;
  return null;
}

function getNativeTokenSymbol(chain) {
  const customChain = getCustomChains().find(
    (chainInfo) => chainInfo.id === chain,
  );
  return (
    customChain?.nativeCurrency?.symbol || NATIVE_TOKEN_SYMBOLS[chain] || "ETH"
  );
}

function getFunctionBaseName(functionName) {
  return functionName?.split("(")[0] || "";
}

function getFunctionTypeSuffix(functionName, baseName) {
  if (!functionName || !baseName || !functionName.startsWith(`${baseName}(`)) {
    return "";
  }
  return functionName.slice(baseName.length);
}

function getTraceLabelParts(contractName, functionName, depth) {
  const baseName = getFunctionBaseName(functionName);
  const contractIncludesFunction =
    baseName && contractName.endsWith(`.${baseName}`);

  if (contractIncludesFunction) {
    return {
      contractLabel:
        depth === 0
          ? `${contractName}${getFunctionTypeSuffix(functionName, baseName)}`
          : contractName,
      functionLabel: "",
    };
  }

  return {
    contractLabel: contractName,
    functionLabel: functionName,
  };
}

// ---------------------------------------------------------------------------
// Syntax-highlight a plain object to HTML (coloured JSON spans)
// ---------------------------------------------------------------------------

function syntaxHighlight(obj, cssClasses) {
  const json = JSON.stringify(obj, null, 2);
  const escaped = json
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return escaped.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = cssClasses.jsonNumber;
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = cssClasses.jsonKey;
        } else {
          cls = cssClasses.jsonString;
        }
      } else if (/true|false/.test(match)) {
        cls = cssClasses.jsonBoolean;
      } else if (/null/.test(match)) {
        cls = cssClasses.jsonNull;
      }
      return `<span class="${cls}">${match}</span>`;
    },
  );
}

function TraceTooltip({ items, onCopy }) {
  return (
    <span className={styles.traceTooltip}>
      {items.map((item, index) => (
        <span key={`item-${index}`}>
          <span className={styles.traceTooltipContent}>{item}</span>
          <button
            className={styles.traceTooltipCopy}
            onClick={(e) => {
              e.stopPropagation();
              onCopy(item);
            }}
          >
            Copy
          </button>
        </span>
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// CallTrace sub-component
// ---------------------------------------------------------------------------

function CallTraceNode({ trace, depth, chain }) {
  const [hideTooltip, setHideTooltip] = useState(false);

  if (!trace) return null;
  if (trace.type === "STATICCALL") return null;

  const contractName =
    trace.toName ||
    resolveAddressName(chain, trace.to) ||
    (trace.to ? `${trace.to.slice(0, 10)}...` : "?");
  const contractAddress = trace.to || "";
  const funcName = trace.functionName || trace.input?.slice(0, 10) || "()";
  const { contractLabel, functionLabel } = getTraceLabelParts(
    contractName,
    funcName,
    depth,
  );

  const traceValueBadge = (() => {
    if (!trace.value) return null;
    try {
      const val = BigInt(trace.value);
      if (val <= 0n) return null;
      return `${formatEther(val)} ETH`;
    } catch {
      return null;
    }
  })();

  const formatValue = (value) => {
    if (value === null || value === undefined) return "null";
    if (Array.isArray(value)) {
      return value
        .map((item) =>
          item !== null && typeof item === "object"
            ? JSON.stringify(item)
            : String(item),
        )
        .join(",\n");
    }
    if (typeof value === "object") {
      const str = JSON.stringify(value);
      return str.length > 60 ? str.slice(0, 60) + "..." : str;
    }
    const str = String(value);
    return str.length > 60 ? str.slice(0, 30) + "..." + str.slice(-20) : str;
  };

  const inputParams =
    trace.decodedInputs
      ?.map((p) => `${p.name}=${formatValue(p.value)}`)
      .join(", ") || "";
  const outputParams =
    trace.decodedOutputs
      ?.map((p) => {
        const hasName = p.name && p.name !== "unknown" && p.name !== "";
        return hasName
          ? `${p.name}=${formatValue(p.value)}`
          : formatValue(p.value);
      })
      .join(", ") || "";
  const contractTooltipItems = [contractAddress];
  if (!functionLabel && trace.input) {
    contractTooltipItems.push(trace.input);
  }

  const copyToClipboard = async (content) => {
    try {
      await navigator.clipboard.writeText(content);
      setHideTooltip(true);
      setTimeout(() => setHideTooltip(false), 300);
    } catch {
      // ignore
    }
  };

  return (
    <div className={styles.traceNode}>
      <div
        className={`${styles.traceCall} ${trace.error ? styles.traceCallError : ""}`}
      >
        <span className={styles.traceType}>{trace.type}</span>
        <span className={styles.traceSignature}>
          <span className={styles.traceContractWrapper}>
            {traceValueBadge && (
              <span className={styles.traceValueBadge}>{traceValueBadge}</span>
            )}
            <span className={styles.traceContract}>{contractLabel}</span>
            {!hideTooltip && (
              <TraceTooltip
                items={contractTooltipItems}
                onCopy={copyToClipboard}
              />
            )}
          </span>
          {functionLabel && <span className={styles.traceDot}>.</span>}
          {functionLabel && (
            <span className={styles.traceFuncWrapper}>
              <span className={styles.traceFuncName}>{functionLabel}</span>
              {trace.input && !hideTooltip && (
                <span className={styles.traceTooltip}>
                  <span className={styles.traceTooltipContent}>
                    {trace.input}
                  </span>
                  <button
                    className={styles.traceTooltipCopy}
                    onClick={(e) => {
                      e.stopPropagation();
                      copyToClipboard(trace.input);
                    }}
                  >
                    Copy
                  </button>
                </span>
              )}
            </span>
          )}
          <span className={styles.traceParams}>({inputParams})</span>
          {outputParams && (
            <>
              <span className={styles.traceArrow}> → </span>
              <span className={styles.traceOutput}>({outputParams})</span>
            </>
          )}
        </span>
        {trace.gasUsed && (
          <span className={styles.traceGas}>
            {Number(trace.gasUsed).toLocaleString()} gas
          </span>
        )}
      </div>

      {trace.error && (
        <div className={styles.traceErrorMsg}>
          Error: {trace.errorReason || trace.error}
        </div>
      )}

      {trace.logs && trace.logs.length > 0 && (
        <div className={styles.traceLogsList}>
          {trace.logs.map((log, i) => (
            <div key={i} className={styles.traceLog}>
              <span className={styles.traceLogIcon}>📝</span>
              <span className={styles.traceLogName}>{log.name}</span>
              <span className={styles.traceLogParams}>
                (
                {log.inputs
                  ?.map((p) => {
                    const v = p.value;
                    if (v === null || v === undefined) return `${p.name}=null`;
                    if (Array.isArray(v)) {
                      const items = v
                        .map((item) =>
                          item !== null && typeof item === "object"
                            ? JSON.stringify(item)
                            : String(item),
                        )
                        .join(",\n");
                      return `${p.name}=${items}`;
                    }
                    if (typeof v === "object") {
                      const s = JSON.stringify(v);
                      return `${p.name}=${s.length > 60 ? s.slice(0, 60) + "..." : s}`;
                    }
                    const s = String(v);
                    return `${p.name}=${s.length > 60 ? s.slice(0, 30) + "..." + s.slice(-20) : s}`;
                  })
                  .join(", ")}
                )
              </span>
            </div>
          ))}
        </div>
      )}

      {trace.calls && trace.calls.length > 0 && (
        <div className={styles.traceChildren}>
          {trace.calls.map((child, i) => (
            <CallTraceNode
              key={`${depth}-${i}`}
              trace={child}
              depth={`${depth}-${i}`}
              chain={chain}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main ResultPanel component
// ---------------------------------------------------------------------------

/**
 * ResultPanel — top-level result container.
 *
 * Props:
 *   result        {SimResult|ReadResult|null}
 *   error         {string|null}
 *   chain         {string}
 *   address       {string}
 *   fromAddress   {string}
 *   tokenSymbols  {Record<string,string>}
 *   tokenDecimals {Record<string,number>}
 *   tokenPrices   {Record<string,number>}
 */
export default function ResultPanel({
  result,
  error,
  chain,
  address,
  fromAddress,
  tokenSymbols = {},
  tokenDecimals = {},
  tokenPrices = {},
}) {
  // Purely-display toggles owned by this component
  const [resultCollapsed, setResultCollapsed] = useState(false);
  const [showFullResponse, setShowFullResponse] = useState(false);
  const [isYaml, setIsYaml] = useState(false);
  const [copied, setCopied] = useState(false);
  const [simLogsExpanded, setSimLogsExpanded] = useState(true);
  const [selectedSimLogNames, setSelectedSimLogNames] = useState([]);
  const [bdExpandedAddrs, setBdExpandedAddrs] = useState(new Set());
  const [bdExpandedTokens, setBdExpandedTokens] = useState(new Set());

  const getExplorerAddressUrl = (addr) => buildExplorerAddressUrl(chain, addr);
  const getLogContractName = (addr) => getContractNameFromCache(chain, addr);
  const getLogTokenSymbol = (addr) =>
    tokenSymbols[addr] || getCachedTokenSymbol(chain, addr);
  const getLogTokenDecimals = (addr) =>
    tokenDecimals[addr] ?? getCachedTokenDecimals(chain, addr);
  const nativeTokenSymbol = getNativeTokenSymbol(chain);
  const legacyNativeBalanceChanges = (
    Array.isArray(result?.balanceChanges) ? result.balanceChanges : []
  ).filter((change) => {
    const tokenAddress = change.tokenAddress?.toLowerCase();
    return (
      change.before != null &&
      change.after != null &&
      change.value != null &&
      (!tokenAddress || tokenAddress === NATIVE_TOKEN_ADDRESS)
    );
  });

  // Build display content (syntax-highlighted JSON or YAML)
  const getDisplayContent = () => {
    if (!result) return "";
    if (isYaml) {
      return yaml.dump(result, { indent: 2, lineWidth: -1, noRefs: true });
    }
    return syntaxHighlight(result, {
      jsonNumber: styles.jsonNumber,
      jsonKey: styles.jsonKey,
      jsonString: styles.jsonString,
      jsonBoolean: styles.jsonBoolean,
      jsonNull: styles.jsonNull,
    });
  };

  const handleCopy = async () => {
    try {
      const text = isYaml
        ? yaml.dump(result, { indent: 2, lineWidth: -1, noRefs: true })
        : JSON.stringify(result, null, 2);
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  if (!error && !result) return null;

  return (
    <>
      {error && (
        <div className={styles.error}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {result && (
        <div className={styles.result}>
          {/* Header */}
          <div className={styles.resultHeader}>
            <div className={styles.resultTitle}>
              <button
                onClick={() => setResultCollapsed((v) => !v)}
                className={styles.collapseButton}
                type="button"
              >
                {resultCollapsed ? "▶" : "▼"}
              </button>
              <h2>Result:</h2>
              {result.simulated && (
                <span className={styles.simulatedBadge}>Simulated</span>
              )}
              {result.success === false && (
                <span className={styles.failedBadge}>Failed</span>
              )}
            </div>
            <div className={styles.resultActions}>
              <button
                onClick={() => setResultCollapsed((v) => !v)}
                className={styles.actionButton}
                type="button"
              >
                {resultCollapsed ? "Expand" : "Collapse"}
              </button>
              {!resultCollapsed && (
                <>
                  <button
                    onClick={() => setShowFullResponse((v) => !v)}
                    className={`${styles.actionButton} ${showFullResponse ? styles.actionButtonActive : ""}`}
                    type="button"
                  >
                    {showFullResponse ? "Hide Full" : "Show Full"}
                  </button>
                  {showFullResponse && (
                    <>
                      <button
                        onClick={() => setIsYaml((v) => !v)}
                        className={styles.actionButton}
                        type="button"
                      >
                        {isYaml ? "JSON" : "YAML"}
                      </button>
                      <button
                        onClick={handleCopy}
                        className={styles.actionButton}
                        type="button"
                      >
                        {copied ? "Copied!" : "Copy"}
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          {!resultCollapsed && (
            <>
              {/* Transaction Info (simulation only) */}
              {result.simulated && (
                <div className={styles.txInfoSection}>
                  <h3 className={styles.txInfoTitle}>Transaction Info</h3>
                  <div className={styles.txInfoGrid}>
                    <div className={styles.txInfoRow}>
                      <span className={styles.txInfoLabel}>From:</span>
                      <span className={styles.txInfoValue}>
                        {result.callTrace?.from ||
                          fromAddress ||
                          "0x0000000000000000000000000000000000000001"}
                      </span>
                    </div>
                    <div className={styles.txInfoRow}>
                      <span className={styles.txInfoLabel}>To:</span>
                      <span className={styles.txInfoValue}>
                        {result.callTrace?.to || address}
                      </span>
                    </div>
                    {result.callTrace?.value &&
                      (() => {
                        try {
                          const val = BigInt(result.callTrace.value);
                          if (val <= 0n) return null;
                          return (
                            <div className={styles.txInfoRow}>
                              <span className={styles.txInfoLabel}>Value:</span>
                              <span className={styles.txInfoValue}>
                                {formatEther(val)} ETH
                              </span>
                            </div>
                          );
                        } catch {
                          return null;
                        }
                      })()}
                    {result.callTrace?.input && (
                      <div className={styles.txInfoRow}>
                        <span className={styles.txInfoLabel}>Input:</span>
                        {result.callTrace.input.length > 40 ? (
                          <span className={styles.txInfoInputWrapper}>
                            <span className={styles.txInfoValueMono}>
                              {result.callTrace.input.slice(0, 10)}...
                              {result.callTrace.input.slice(-10)}
                            </span>
                            <span className={styles.txInfoTooltip}>
                              <span className={styles.traceTooltipContent}>
                                {result.callTrace.input}
                              </span>
                            </span>
                          </span>
                        ) : (
                          <span className={styles.txInfoValueMono}>
                            {result.callTrace.input}
                          </span>
                        )}
                      </div>
                    )}
                    {result.gasUsed && (
                      <div className={styles.txInfoRow}>
                        <span className={styles.txInfoLabel}>Gas Used:</span>
                        <span className={styles.txInfoValue}>
                          {result.gasUsed.toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Event Logs (simulation only) */}
              <SimulatedEventLogs
                logs={result.simulated ? result.logs : []}
                expanded={simLogsExpanded}
                onToggleExpanded={() => setSimLogsExpanded((value) => !value)}
                selectedEventNames={selectedSimLogNames}
                onSelectedEventNamesChange={setSelectedSimLogNames}
                getExplorerAddressUrl={getExplorerAddressUrl}
                getContractName={getLogContractName}
                getTokenSymbol={getLogTokenSymbol}
                getTokenDecimals={getLogTokenDecimals}
              />

              {/* Call Trace Tree (simulation only) */}
              {result.simulated && result.callTrace && (
                <div className={styles.traceSection}>
                  <h3 className={styles.traceTitle}>Call Trace</h3>
                  <div className={styles.traceTree}>
                    <CallTraceNode
                      trace={result.callTrace}
                      depth={0}
                      chain={chain}
                    />
                  </div>
                </div>
              )}

              {/* Balance Changes (legacy ETH before/after — simulation only) */}
              {result.simulated && legacyNativeBalanceChanges.length > 0 && (
                <div className={styles.balanceSection}>
                  <h3 className={styles.balanceTitle}>
                    Balance Changes ({legacyNativeBalanceChanges.length})
                  </h3>
                  {legacyNativeBalanceChanges.map((change, index) => (
                    <div key={index} className={styles.balanceItem}>
                      <div className={styles.balanceAddress}>
                        {change.address?.slice(0, 10)}...
                        {change.address?.slice(-8)}
                      </div>
                      <div className={styles.balanceValues}>
                        <span className={styles.balanceBefore}>
                          {formatNativeWhole(change.before)} {nativeTokenSymbol}
                        </span>
                        <span className={styles.balanceArrow}>→</span>
                        <span className={styles.balanceAfter}>
                          {formatNativeWhole(change.after)} {nativeTokenSymbol}
                        </span>
                        {parseBigIntOrNull(change.value) !== null && (
                          <span
                            className={`${styles.balanceDiff} ${isNonNegativeBigInt(change.value) ? styles.balanceDiffPositive : styles.balanceDiffNegative}`}
                          >
                            ({isNonNegativeBigInt(change.value) ? "+" : ""}
                            {formatNativeWhole(change.value)}{" "}
                            {nativeTokenSymbol})
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Balance Changes table (simulation only) */}
              {result.simulated &&
                (() => {
                  const rows = enrichBalanceChanges({
                    logs: result.logs,
                    balanceChanges: result.balanceChanges,
                    tokenSymbols,
                    tokenDecimals,
                    tokenPrices,
                    nativeTokenSymbol,
                    resolveTokenSymbol: (tokenAddr) =>
                      getCachedTokenSymbol(chain, tokenAddr),
                    resolveTokenDecimals: (tokenAddr) =>
                      getCachedTokenDecimals(chain, tokenAddr),
                  })
                    .map((change) => {
                      let diff;
                      try {
                        diff = BigInt(String(change.value));
                      } catch {
                        return null;
                      }
                      if (diff === 0n) return null;
                      const tokenAddr =
                        change.tokenAddress || NATIVE_TOKEN_ADDRESS;
                      return {
                        addr: change.address,
                        symbol:
                          change.symbol ||
                          change.name ||
                          `${tokenAddr.slice(0, 6)}…`,
                        tokenAddr,
                        diff,
                        absFormatted: formatTokenAmount(
                          diff < 0n ? -diff : diff,
                          change.decimals ?? 18,
                        ),
                        usd: change.valueUsd,
                      };
                    })
                    .filter(Boolean);

                  if (rows.length === 0) return null;

                  const addrTotals = {};
                  for (const row of rows) {
                    if (row.usd != null) {
                      addrTotals[row.addr] =
                        (addrTotals[row.addr] ?? 0) + row.usd;
                    }
                  }

                  const fmtUsd = (v) =>
                    Math.abs(v).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    });

                  const rowGroups = [];
                  for (const row of rows) {
                    const currentGroup = rowGroups[rowGroups.length - 1];
                    if (currentGroup?.addr === row.addr) {
                      currentGroup.rows.push(row);
                    } else {
                      rowGroups.push({ addr: row.addr, rows: [row] });
                    }
                  }

                  return (
                    <div className={styles.bdSection}>
                      <h3 className={styles.bdTitle}>Balance Changes</h3>
                      <div className={styles.bdTableWrap}>
                        <table className={styles.bdTable}>
                          <thead>
                            <tr>
                              <th className={styles.bdTh}>Addresses</th>
                              <th className={styles.bdTh}>Token</th>
                              <th className={styles.bdTh}>Balance</th>
                              <th className={styles.bdTh}>Value in USD</th>
                              <th className={styles.bdTh}>
                                Total Value in USD
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {rowGroups.map((group) =>
                              group.rows.map((row, rowIndex) => {
                                const pos = row.diff >= 0n;
                                const totalUsd = addrTotals[row.addr];
                                const totalPos =
                                  totalUsd != null ? totalUsd >= 0 : pos;
                                const isSender =
                                  fromAddress &&
                                  group.addr === fromAddress.toLowerCase();
                                const isReceiver =
                                  address &&
                                  group.addr === address.toLowerCase();
                                const isFirstGroupRow = rowIndex === 0;
                                return (
                                  <tr
                                    key={`${row.addr}-${row.tokenAddr}`}
                                    className={styles.bdRow}
                                  >
                                    {isFirstGroupRow && (
                                      <td
                                        className={styles.bdTd}
                                        rowSpan={group.rows.length}
                                      >
                                        <div className={styles.bdAddrCell}>
                                          <span
                                            className={styles.bdAddr}
                                            title={group.addr}
                                            onClick={() =>
                                              setBdExpandedAddrs((prev) => {
                                                const next = new Set(prev);
                                                next.has(group.addr)
                                                  ? next.delete(group.addr)
                                                  : next.add(group.addr);
                                                return next;
                                              })
                                            }
                                          >
                                            {bdExpandedAddrs.has(group.addr)
                                              ? group.addr
                                              : `${group.addr.slice(0, 10)}…${group.addr.slice(-8)}`}
                                          </span>
                                          {(() => {
                                            const url = getExplorerAddressUrl(
                                              group.addr,
                                            );
                                            return url ? (
                                              <a
                                                href={url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className={
                                                  styles.bdAddrExplorerLink
                                                }
                                                title="View on explorer"
                                                onClick={(e) =>
                                                  e.stopPropagation()
                                                }
                                              >
                                                ↗
                                              </a>
                                            ) : null;
                                          })()}
                                          {(isSender || isReceiver) && (
                                            <span
                                              className={`${styles.bdRole} ${isSender ? styles.bdRoleSender : styles.bdRoleReceiver}`}
                                            >
                                              {isSender ? "Sender" : "Receiver"}
                                            </span>
                                          )}
                                        </div>
                                      </td>
                                    )}
                                    <td className={styles.bdTd}>
                                      <div
                                        className={styles.bdTokenCell}
                                        onClick={() =>
                                          row.tokenAddr !==
                                            NATIVE_TOKEN_ADDRESS &&
                                          setBdExpandedTokens((prev) => {
                                            const next = new Set(prev);
                                            next.has(row.tokenAddr)
                                              ? next.delete(row.tokenAddr)
                                              : next.add(row.tokenAddr);
                                            return next;
                                          })
                                        }
                                        style={
                                          row.tokenAddr !== NATIVE_TOKEN_ADDRESS
                                            ? { cursor: "pointer" }
                                            : undefined
                                        }
                                        title={
                                          row.tokenAddr !== NATIVE_TOKEN_ADDRESS
                                            ? row.tokenAddr
                                            : undefined
                                        }
                                      >
                                        <span className={styles.bdTokenIcon}>
                                          {row.symbol[0].toUpperCase()}
                                        </span>
                                        <span className={styles.bdTokenName}>
                                          {row.symbol}
                                          {bdExpandedTokens.has(
                                            row.tokenAddr,
                                          ) && (
                                            <span
                                              className={styles.bdTokenAddr}
                                            >
                                              {row.tokenAddr}
                                            </span>
                                          )}
                                        </span>
                                      </div>
                                    </td>
                                    <td
                                      className={`${styles.bdTd} ${pos ? styles.bdPos : styles.bdNeg}`}
                                    >
                                      {pos ? "+" : "-"}
                                      {row.absFormatted}
                                    </td>
                                    <td
                                      className={`${styles.bdTd} ${pos ? styles.bdPos : styles.bdNeg}`}
                                    >
                                      {row.usd != null
                                        ? `$${fmtUsd(row.usd)}`
                                        : "–"}
                                    </td>
                                    {isFirstGroupRow && (
                                      <td
                                        className={styles.bdTd}
                                        rowSpan={group.rows.length}
                                      >
                                        {totalUsd != null ? (
                                          <span
                                            className={`${styles.bdTotalBadge} ${totalPos ? styles.bdTotalPos : styles.bdTotalNeg}`}
                                          >
                                            {totalPos ? "+ " : "– "}$
                                            {fmtUsd(totalUsd)}
                                          </span>
                                        ) : (
                                          "–"
                                        )}
                                      </td>
                                    )}
                                  </tr>
                                );
                              }),
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })()}

              {/* Storage Changes (simulation only) */}
              {result.simulated &&
                result.stateChanges &&
                result.stateChanges.length > 0 && (
                  <div className={styles.stateSection}>
                    <h3 className={styles.stateTitle}>
                      Storage Access ({result.stateChanges.length})
                    </h3>
                    {result.stateChanges.map((change, index) => (
                      <div key={index} className={styles.stateItem}>
                        <div className={styles.stateAddress}>
                          {change.address?.slice(0, 10)}...
                          {change.address?.slice(-8)}
                        </div>
                        {change.changes && change.changes.length > 0 && (
                          <div className={styles.stateChanges}>
                            {change.changes.map((c, i) => (
                              <div key={i} className={styles.stateChange}>
                                <div className={styles.stateSlot}>
                                  <span className={styles.stateSlotLabel}>
                                    Slot:
                                  </span>{" "}
                                  {c.key || c.slot}
                                </div>
                                {c.original !== undefined && (
                                  <div className={styles.stateOriginal}>
                                    <span className={styles.stateLabel}>
                                      Before:
                                    </span>{" "}
                                    {c.original}
                                  </div>
                                )}
                                {c.dirty !== undefined && (
                                  <div className={styles.stateDirty}>
                                    <span className={styles.stateLabel}>
                                      After:
                                    </span>{" "}
                                    {c.dirty}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {change.storage && change.storage.length > 0 && (
                          <div className={styles.stateChanges}>
                            {change.storage.map((s, i) => (
                              <div key={i} className={styles.stateChange}>
                                <div className={styles.stateSlot}>
                                  <span className={styles.stateSlotLabel}>
                                    Slot:
                                  </span>{" "}
                                  {s.slot}
                                </div>
                                <div className={styles.stateDirty}>
                                  <span className={styles.stateLabel}>
                                    Value:
                                  </span>{" "}
                                  {s.value}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

              {/* Decoded Outputs — always show for read calls; for simulate only on Show Full */}
              {(!result.simulated || showFullResponse) && (
                <>
                  {result.decoded && result.decoded.length > 0 && (
                    <div className={styles.decodedSection}>
                      <h3 className={styles.decodedTitle}>Decoded Output</h3>
                      {result.decoded.map((output, index) => (
                        <div key={index} className={styles.decodedItem}>
                          <div className={styles.decodedHeader}>
                            <span className={styles.decodedName}>
                              {output.name}
                            </span>
                            <span className={styles.decodedType}>
                              {output.type}
                            </span>
                          </div>
                          <div className={styles.decodedValue}>
                            {output.type === "address" &&
                            typeof output.value === "string"
                              ? (() => {
                                  const url = getExplorerAddressUrl(
                                    output.value,
                                  );
                                  return url ? (
                                    <a
                                      href={url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      {output.value}
                                    </a>
                                  ) : (
                                    output.value
                                  );
                                })()
                              : typeof output.value === "object"
                                ? JSON.stringify(output.value, null, 2)
                                : String(output.value)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* Raw Response (Show Full only) */}
              {showFullResponse && result.rawData && (
                <div className={styles.rawSection}>
                  <h3 className={styles.rawTitle}>Raw Response</h3>
                  <div className={styles.rawData}>{result.rawData}</div>
                </div>
              )}

              {/* Full JSON/YAML (Show Full only) */}
              {showFullResponse && (
                <div className={styles.fullOutput}>
                  <pre
                    className={styles.json}
                    dangerouslySetInnerHTML={{ __html: getDisplayContent() }}
                  />
                </div>
              )}
            </>
          )}

          {/* Simulation metrics panel — collapsible, always rendered for simulated runs that include metrics */}
          {result.simulated && result.metrics && (
            <MetricsPanel metrics={result.metrics} />
          )}
        </div>
      )}
    </>
  );
}
