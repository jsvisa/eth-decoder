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
 *   noToggle        {boolean}             - hide toggle, always show body
 *   hideDecodeAndFill {boolean}           - hide Decode & fill button
 */
export default function CalldataSection({
  expanded,
  onToggle,
  value,
  onValueChange,
  error,
  onDecodeAndFill,
  disabled,
  noToggle,
  hideDecodeAndFill,
}) {
  const textareaClass = error
    ? `${styles.textarea} ${styles.inputError}`
    : styles.textarea;

  const showBody = noToggle || expanded;

  return React.createElement(
    "div",
    { className: styles.pasteCalldataSection },
    !noToggle &&
      React.createElement(
        "button",
        {
          type: "button",
          className: styles.pasteCalldataToggle,
          onClick: onToggle,
        },
        `${expanded ? "▼" : "▶"} Calldata`,
      ),
    showBody &&
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
        !hideDecodeAndFill &&
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
