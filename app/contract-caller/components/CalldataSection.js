"use client";

import React from "react";
import styles from "./CalldataSection.module.css";

/**
 * CalldataSection — collapsible textarea to paste hex calldata with a
 * Decode-and-Fill action.
 *
 * Props:
 *   expanded        {boolean}             - section open/closed
 *   onToggle        {() => void}          - toggle expanded
 *   value           {string}              - pasted calldata hex
 *   onValueChange   {(v: string) => void} - update calldata text
 *   error           {string|null}         - decode error message
 *   onDecodeAndFill {() => void}          - run decode and fill function/args
 *   disabled        {boolean}             - disabled while loading
 */
export default function CalldataSection({
  expanded,
  onToggle,
  value,
  onValueChange,
  error,
  onDecodeAndFill,
  disabled,
}) {
  const textareaClass = error
    ? `${styles.textarea} ${styles.inputError}`
    : styles.textarea;

  return React.createElement(
    "div",
    { className: styles.pasteCalldataSection },
    React.createElement(
      "button",
      {
        type: "button",
        className: styles.pasteCalldataToggle,
        onClick: onToggle,
      },
      `${expanded ? "▼" : "▶"} Calldata`,
    ),
    expanded &&
      React.createElement(
        "div",
        { className: styles.pasteCalldataBody },
        React.createElement("textarea", {
          className: textareaClass,
          value: value,
          onChange: (e) => onValueChange(e.target.value),
          placeholder: "0x{4-byte selector}{encoded args}",
          rows: 3,
          disabled: disabled,
        }),
        error &&
          React.createElement(
            "span",
            { className: styles.pasteCalldataError },
            error,
          ),
        React.createElement(
          "button",
          {
            type: "button",
            className: styles.pasteCalldataBtn,
            onClick: onDecodeAndFill,
            disabled: disabled || !value.trim(),
          },
          "Decode & fill",
        ),
      ),
  );
}
