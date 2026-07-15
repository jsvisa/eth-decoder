"use client";

import React, { useState } from "react";
import styles from "./FunctionSelector.module.css";
import {
  isReadOnly,
  getFunctionSig,
  getFunctionSelector,
} from "../utils/functionArgs";

/** Human-readable signature with output types */
function buildDisplaySig(func) {
  const outputs =
    func.outputs && func.outputs.length > 0
      ? ` → ${func.outputs.map((o) => o.type).join(", ")}`
      : "";
  return `${func.name}(${func.inputs.map((i) => `${i.type}${i.name ? " " + i.name : ""}`).join(", ")})${outputs}`;
}

/**
 * Searchable function dropdown with read/write badge, 4-byte selector,
 * and copy-signature affordance.
 *
 * @param {{
 *   functions: object[],
 *   selectedFunction: string,
 *   onSelectFunction: (sig: string) => void,
 *   disabled: boolean,
 * }} props
 */
export default function FunctionSelector({
  functions = [],
  selectedFunction,
  onSelectFunction,
  disabled,
}) {
  const [filter, setFilter] = useState("");
  const [showList, setShowList] = useState(false);
  const [copiedItem, setCopiedItem] = useState(null);

  const selectedFuncObj = selectedFunction
    ? functions.find((f) => getFunctionSig(f) === selectedFunction)
    : null;

  const filteredFunctions = filter.trim()
    ? functions.filter((f) =>
        getFunctionSig(f).toLowerCase().includes(filter.toLowerCase()),
      )
    : functions;

  async function copyToClipboard(text, key) {
    await navigator.clipboard.writeText(text);
    setCopiedItem(key);
    setTimeout(() => setCopiedItem(null), 1500);
  }

  const selector = selectedFuncObj
    ? getFunctionSelector(selectedFuncObj)
    : null;

  // Label row: "Function" label + optional read/write badge + optional selector badge
  const labelRow = React.createElement(
    "div",
    { className: styles.functionLabelRow },
    React.createElement("label", { className: styles.label }, "Function"),
    selectedFuncObj &&
      React.createElement(
        "span",
        {
          className: isReadOnly(selectedFuncObj)
            ? styles.readBadge
            : styles.writeBadge,
        },
        isReadOnly(selectedFuncObj) ? "read" : "write",
      ),
    selectedFuncObj &&
      selector &&
      React.createElement(
        "span",
        {
          className: `${styles.funcSelector} ${copiedItem === "selector" ? styles.copied : ""}`,
          onClick: () => copyToClipboard(selector, "selector"),
          title: "Click to copy selector",
        },
        copiedItem === "selector" ? "Copied!" : selector,
      ),
  );

  // Function items in the dropdown list
  const functionItems = filteredFunctions.map((func) => {
    const sig = getFunctionSig(func);
    return React.createElement(
      "div",
      {
        key: sig,
        className: `${styles.functionItem} ${selectedFunction === sig ? styles.functionItemSelected : ""}`,
        onClick: () => {
          onSelectFunction(sig);
          setFilter("");
          setShowList(false);
        },
      },
      React.createElement(
        "span",
        {
          className: isReadOnly(func)
            ? styles.funcReadTag
            : styles.funcWriteTag,
        },
        isReadOnly(func) ? "R" : "W",
      ),
      React.createElement("span", { className: styles.funcName }, func.name),
      React.createElement(
        "span",
        { className: styles.funcParams },
        "(",
        func.inputs
          .map((i) => `${i.type}${i.name ? " " + i.name : ""}`)
          .join(", "),
        ")",
      ),
      func.outputs &&
        func.outputs.length > 0 &&
        React.createElement(
          "span",
          { className: styles.funcReturns },
          `→ ${func.outputs.map((o) => o.type).join(", ")}`,
        ),
    );
  });

  // Dropdown list panel
  const dropdownList = showList
    ? React.createElement(
        "div",
        { className: styles.functionList },
        selectedFuncObj &&
          React.createElement(
            "div",
            { className: styles.functionListSearch },
            React.createElement("input", {
              type: "text",
              value: filter,
              onChange: (e) => setFilter(e.target.value),
              placeholder: "Search functions...",
              className: styles.functionSearchInput,
              autoFocus: true,
            }),
          ),
        ...functionItems,
        filteredFunctions.length === 0 &&
          React.createElement(
            "div",
            { className: styles.functionItemEmpty },
            "No matching functions",
          ),
      )
    : null;

  // Main input area: selected display or search input
  const inputArea = selectedFuncObj
    ? React.createElement(
        "div",
        { className: styles.selectedFunctionDisplay },
        React.createElement(
          "button",
          {
            className: styles.changeFunctionBtnLeft,
            onClick: () => setShowList((v) => !v),
            title: "Change function",
          },
          "▼",
        ),
        React.createElement(
          "span",
          {
            className: `${styles.selectedFunctionText} ${copiedItem === "signature" ? styles.copiedText : ""}`,
            onClick: () =>
              copyToClipboard(buildDisplaySig(selectedFuncObj), "signature"),
            title: "Click to copy function signature",
          },
          copiedItem === "signature"
            ? "✓ Copied!"
            : buildDisplaySig(selectedFuncObj),
        ),
        React.createElement(
          "button",
          {
            className: styles.clearFunctionBtn,
            onClick: () => {
              onSelectFunction("");
              setFilter("");
            },
            title: "Clear selection",
          },
          "×",
        ),
        React.createElement(
          "button",
          {
            className: styles.changeFunctionBtn,
            onClick: () => setShowList((v) => !v),
            title: "Change function",
          },
          "▼",
        ),
      )
    : React.createElement("input", {
        type: "text",
        value: filter,
        onChange: (e) => {
          setFilter(e.target.value);
          setShowList(true);
        },
        onFocus: () => setShowList(true),
        onBlur: () => setTimeout(() => setShowList(false), 200),
        placeholder: "Search or select a function...",
        className: styles.input,
        disabled: disabled,
      });

  return React.createElement(
    "div",
    { className: styles.field },
    labelRow,
    React.createElement(
      "div",
      { className: styles.functionSelectWrapper },
      inputArea,
      dropdownList,
    ),
  );
}
