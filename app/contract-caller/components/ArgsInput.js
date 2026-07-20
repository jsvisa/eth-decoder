"use client";

import React from "react";
import styles from "./ArgsInput.module.css";
import ArgInputRouter from "./ArgInputRouter";
import { isReadOnly, isPayable } from "../utils/functionArgs";

/**
 * ArgsInput — renders per-argument inputs for a selected ABI function,
 * plus inline ETH-value input (payable) and block-number input (read).
 *
 * Props:
 *   fn                     {AbiFunction|null}          - selected function
 *   args                   {any[]}                     - current arg values
 *   onArgsChange           {(arr) => void}             - update args
 *   fieldErrors            {Record<string,string>}     - per-arg validation errors
 *   addressBook            {AddressBookEntry[]}        - address book for suggestions
 *   onOpenBookmarkModal    {(addr: string) => void}    - bookmark an address arg
 *   blockNumber            {string}                    - block-number for read state
 *   onBlockNumberChange    {(s: string) => void}       - set historical block-number
 *   ethValue               {string}                    - ETH value for payable
 *   onEthValueChange       {(s: string) => void}       - update ETH value
 *   ethValueUnit           {'ETH'|'Wei'}               - unit toggle
 *   onEthValueUnitChange   {(u) => void}               - toggle unit
 *   disabled               {boolean}                   - disabled while loading
 *   ArgInputComponent      {React.Component|undefined} - optional arg input component
 */
export default function ArgsInput({
  fn,
  args,
  onArgsChange,
  fieldErrors,
  addressBook,
  onOpenBookmarkModal,
  blockNumber,
  onBlockNumberChange,
  ethValue,
  onEthValueChange,
  ethValueUnit,
  onEthValueUnitChange,
  disabled,
  ArgInputComponent,
}) {
  if (!fn) return null;

  const inputs = fn.inputs || [];
  const hasArgs = inputs.length > 0;

  const handleArgChange = (index, value) => {
    const newArgs = [...args];
    newArgs[index] = value;
    onArgsChange(newArgs);
  };

  const children = [];

  // Payable ETH value section
  if (isPayable(fn)) {
    children.push(
      React.createElement(
        "div",
        { key: "eth-value", className: styles.field },
        React.createElement(
          "label",
          { className: styles.label },
          "ETH Value",
          " ",
          React.createElement(
            "span",
            { className: styles.payableBadge },
            "payable",
          ),
        ),
        React.createElement(
          "div",
          { className: styles.ethValueWrapper },
          React.createElement("input", {
            type: "text",
            value: ethValue,
            onChange: (e) => onEthValueChange(e.target.value),
            placeholder: ethValueUnit === "ETH" ? "0.0" : "0",
            className:
              styles.ethValueInput +
              (fieldErrors.ethValue ? " " + styles.inputError : ""),
            disabled: disabled,
          }),
          React.createElement(
            "div",
            { className: styles.ethValueUnitToggle },
            React.createElement(
              "button",
              {
                type: "button",
                className:
                  styles.ethValueUnitBtn +
                  (ethValueUnit === "Wei" ? " " + styles.active : ""),
                onClick: () => onEthValueUnitChange("Wei"),
              },
              "Wei",
            ),
            React.createElement(
              "button",
              {
                type: "button",
                className:
                  styles.ethValueUnitBtn +
                  (ethValueUnit === "ETH" ? " " + styles.active : ""),
                onClick: () => onEthValueUnitChange("ETH"),
              },
              "ETH",
            ),
          ),
        ),
      ),
    );
  }

  // Arguments section (when the function has inputs)
  if (hasArgs) {
    const argFields = inputs.map((input, index) => {
      const argError = fieldErrors[`arg_${index}`];
      const argInput = React.createElement(ArgInputRouter, {
        input,
        value: args[index],
        onChange: (value) => handleArgChange(index, value),
        error: argError,
        ArgInputComponent,
        addressBook,
        disabled,
        onOpenBookmarkModal,
      });

      return React.createElement(
        "div",
        { key: index, className: styles.argField },
        React.createElement(
          "label",
          { className: styles.argLabel },
          `${input.name || `arg${index}`} (${input.type})`,
        ),
        argInput,
      );
    });

    const blockInline = isReadOnly(fn)
      ? React.createElement(
          "div",
          { className: styles.readBlockInline },
          React.createElement(
            "label",
            { className: styles.readBlockLabel },
            "Block",
          ),
          React.createElement("input", {
            type: "text",
            value: blockNumber,
            onChange: (e) =>
              onBlockNumberChange(e.target.value.replace(/[^0-9]/g, "")),
            placeholder: "latest",
            className: styles.readBlockInput,
            disabled: disabled,
          }),
        )
      : null;

    children.push(
      React.createElement(
        "div",
        { key: "args-section", className: styles.argsSection },
        React.createElement(
          "div",
          { className: styles.argsSectionHeader },
          React.createElement(
            "label",
            { className: styles.label },
            "Arguments",
          ),
          blockInline,
        ),
        ...argFields,
      ),
    );
  }

  // Standalone block input for read-only functions with no args
  if (!hasArgs && isReadOnly(fn)) {
    children.push(
      React.createElement(
        "div",
        { key: "block-standalone", className: styles.readBlockStandalone },
        React.createElement(
          "label",
          { className: styles.readBlockLabel },
          "Block",
        ),
        React.createElement("input", {
          type: "text",
          value: blockNumber,
          onChange: (e) =>
            onBlockNumberChange(e.target.value.replace(/[^0-9]/g, "")),
          placeholder: "latest",
          className: styles.readBlockInput,
          disabled: disabled,
        }),
      ),
    );
  }

  return React.createElement(React.Fragment, null, ...children);
}
