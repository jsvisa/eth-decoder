"use client";

import React, { useState } from "react";
import styles from "./CallTrace.module.css";

const BUILT_IN_EXPLORER_URLS = {
  ethereum: "https://etherscan.io",
  arbitrum: "https://arbiscan.io",
  base: "https://basescan.org",
  polygon: "https://polygonscan.com",
  bsc: "https://bscscan.com",
};

function getExplorerAddressUrl(chain, address) {
  if (!address) return null;
  const base = BUILT_IN_EXPLORER_URLS[chain];
  if (base) return `${base}/address/${address}`;
  return null;
}

function formatValue(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "object") {
    const str = JSON.stringify(value);
    return str.length > 60 ? str.slice(0, 60) + "..." : str;
  }
  const str = String(value);
  return str.length > 60 ? str.slice(0, 30) + "..." + str.slice(-20) : str;
}

/**
 * Tooltip rendered inside a wrapper element.
 * The tooltip is shown via CSS :hover on the parent `tooltipWrapper` span.
 */
function Tooltip({ content, onCopy }) {
  return React.createElement(
    "span",
    { className: styles.traceTooltip },
    React.createElement(
      "span",
      { className: styles.traceTooltipContent },
      content,
    ),
    React.createElement(
      "button",
      {
        className: styles.traceTooltipCopy,
        onClick: (e) => {
          e.stopPropagation();
          onCopy(content);
        },
      },
      "Copy",
    ),
  );
}

/**
 * CallTraceNode — renders a single trace node recursively.
 */
function CallTraceNode({ trace, depth, chain, hideTooltip, onCopy }) {
  if (!trace) return null;
  if (trace.type === "STATICCALL") return null;

  const contractName =
    trace.toName || (trace.to ? trace.to.slice(0, 10) + "..." : "?");
  const contractAddress = trace.to || "";
  const funcName = trace.functionName || trace.input?.slice(0, 10) || "()";
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

  const callClass = [styles.traceCall, trace.error ? styles.traceCallError : ""]
    .filter(Boolean)
    .join(" ");

  return React.createElement(
    "div",
    { className: styles.traceNode },

    // Main call line
    React.createElement(
      "div",
      { className: callClass },

      // Call type badge
      React.createElement("span", { className: styles.traceType }, trace.type),

      // Signature: ContractName.funcName(params) → (outputs)
      React.createElement(
        "span",
        { className: styles.traceSignature },

        // Contract name with tooltip
        React.createElement(
          "span",
          { className: styles.traceContractWrapper },
          React.createElement(
            "span",
            { className: styles.tooltipWrapper },
            React.createElement(
              "span",
              { className: styles.traceContract },
              contractName,
            ),
            !hideTooltip &&
              contractAddress &&
              React.createElement(Tooltip, {
                content: contractAddress,
                onCopy,
              }),
          ),
        ),

        React.createElement("span", { className: styles.traceDot }, "."),

        // Function name with tooltip
        React.createElement(
          "span",
          { className: styles.traceFuncWrapper },
          React.createElement(
            "span",
            { className: styles.tooltipWrapper },
            React.createElement(
              "span",
              { className: styles.traceFuncName },
              funcName,
            ),
            !hideTooltip &&
              trace.input &&
              React.createElement(Tooltip, { content: trace.input, onCopy }),
          ),
        ),

        // Input params
        React.createElement(
          "span",
          { className: styles.traceParams },
          `(${inputParams})`,
        ),

        // Output params (only if present)
        outputParams &&
          React.createElement(
            React.Fragment,
            null,
            React.createElement(
              "span",
              { className: styles.traceArrow },
              " → ",
            ),
            React.createElement(
              "span",
              { className: styles.traceOutput },
              `(${outputParams})`,
            ),
          ),
      ),

      // Gas used
      trace.gasUsed &&
        React.createElement(
          "span",
          { className: styles.traceGas },
          `${Number(trace.gasUsed).toLocaleString()} gas`,
        ),
    ),

    // Error message
    trace.error &&
      React.createElement(
        "div",
        { className: styles.traceErrorMsg },
        `Error: ${trace.errorReason || trace.error}`,
      ),

    // Logs emitted during this call
    trace.logs &&
      trace.logs.length > 0 &&
      React.createElement(
        "div",
        { className: styles.traceLogsList },
        ...trace.logs.map((log, i) =>
          React.createElement(
            "div",
            { key: i, className: styles.traceLog },
            React.createElement(
              "span",
              { className: styles.traceLogIcon },
              "📝",
            ),
            React.createElement(
              "span",
              { className: styles.traceLogName },
              log.name,
            ),
            React.createElement(
              "span",
              { className: styles.traceLogParams },
              `(${(log.inputs || [])
                .map((p) => `${p.name}=${formatValue(p.value)}`)
                .join(", ")})`,
            ),
          ),
        ),
      ),

    // Nested calls
    trace.calls &&
      trace.calls.length > 0 &&
      React.createElement(
        "div",
        { className: styles.traceChildren },
        ...trace.calls.map((child, i) =>
          React.createElement(CallTraceNode, {
            key: `${depth}-${i}`,
            trace: child,
            depth: `${depth}-${i}`,
            chain,
            hideTooltip,
            onCopy,
          }),
        ),
      ),
  );
}

/**
 * CallTrace — recursive call-trace renderer with hover tooltips and copy.
 *
 * Props:
 *   trace         {object}                - root trace node
 *   tokenSymbols  {Record<string,string>} - for pretty token names
 *   chain         {string}               - for explorer links
 */
export default function CallTrace({ trace, tokenSymbols = {}, chain }) {
  const [hideTooltip, setHideTooltip] = useState(false);

  const handleCopy = async (content) => {
    try {
      await navigator.clipboard.writeText(content);
      setHideTooltip(true);
      setTimeout(() => setHideTooltip(false), 300);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  if (!trace) return null;

  return React.createElement(
    "div",
    { className: styles.traceTree },
    React.createElement(CallTraceNode, {
      trace,
      depth: 0,
      chain,
      hideTooltip,
      onCopy: handleCopy,
    }),
  );
}
