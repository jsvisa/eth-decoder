"use client";

import React from "react";
import styles from "./ArgsInput.module.css";
import ArgInputRouter from "./ArgInputRouter";
import { isReadOnly } from "../utils/functionArgs";

/**
 * ArgsInput — renders per-argument inputs for a selected ABI function,
 * plus block-number input (read-only functions).
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
