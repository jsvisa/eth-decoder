"use client";

import React from "react";
import styles from "./SimulationOptions.module.css";

/**
 * SimulationOptions — write-mode panel for fork-block, from-address,
 * and cheatcodes.
 *
 * Props:
 *   forkBlockNumber          {string}
 *   onForkBlockChange        {(s: string) => void}
 *   fromAddress              {string}
 *   onFromAddressChange      {(s: string) => void}
 *   cheatcodes               {Cheatcodes}
 *   onCheatcodesChange       {(c: Cheatcodes) => void}
 *   balanceOverrides         {Array<{address:string,balance:string}>}
 *   onBalanceOverridesChange {(Array) => void}
 *   storageOverrides         {Array<{address:string,slot:string,value:string}>}
 *   onStorageOverridesChange {(Array) => void}
 *   expanded                 {boolean}
 *   onToggleExpanded         {() => void}
 *   fieldErrors              {Record<string,string>}
 *   onOpenBookmarkModal      {(addr: string) => void}
 *   disabled                 {boolean}
 *   addressBook              {Array}
 */

function AddressArgInput({
  value,
  onChange,
  addressBook = [],
  disabled,
  placeholder,
  onBookmarkClick,
  error,
}) {
  const isValidAddress = value && /^0x[0-9a-fA-F]{40}$/.test(value);
  const isBookmarked =
    isValidAddress &&
    addressBook.some(
      (item) => item.address.toLowerCase() === value.toLowerCase(),
    );

  const handleStarClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isValidAddress || !onBookmarkClick) return;
    onBookmarkClick(value);
  };

  return React.createElement(
    "div",
    { className: styles.addressArgWrapper },
    React.createElement("input", {
      type: "text",
      value: value,
      onChange: (e) => onChange(e.target.value),
      placeholder: placeholder,
      className: `${styles.input} ${error ? styles.inputError : ""}`,
      disabled: disabled,
    }),
    isValidAddress &&
      onBookmarkClick &&
      React.createElement(
        "button",
        {
          type: "button",
          className: `${styles.addressBookToggleButton} ${isBookmarked ? styles.bookmarked : ""}`,
          onClick: handleStarClick,
          title: isBookmarked ? "Edit bookmark" : "Add to address book",
        },
        isBookmarked ? "★" : "☆",
      ),
  );
}

export default function SimulationOptions({
  forkBlockNumber,
  onForkBlockChange,
  fromAddress,
  onFromAddressChange,
  cheatcodes,
  onCheatcodesChange,
  balanceOverrides = [],
  onBalanceOverridesChange,
  storageOverrides = [],
  onStorageOverridesChange,
  expanded,
  onToggleExpanded,
  fieldErrors = {},
  onOpenBookmarkModal,
  disabled,
  addressBook = [],
}) {
  const hasCheatcodesExpanded =
    expanded && (cheatcodes.deal.enabled || cheatcodes.warp.enabled);

  const cheatcodeControls = React.createElement(
    "div",
    { className: styles.cheatcodesInline },
    React.createElement(
      "label",
      {
        className: styles.cheatcodeInlineItem,
        title: "vm.deal - Set ETH balance",
      },
      React.createElement("input", {
        type: "checkbox",
        checked: cheatcodes.deal.enabled,
        onChange: (e) =>
          onCheatcodesChange({
            ...cheatcodes,
            deal: { ...cheatcodes.deal, enabled: e.target.checked },
          }),
      }),
      React.createElement("span", null, "deal"),
    ),
    React.createElement(
      "label",
      {
        className: styles.cheatcodeInlineItem,
        title: "vm.warp - Set timestamp",
      },
      React.createElement("input", {
        type: "checkbox",
        checked: cheatcodes.warp.enabled,
        onChange: (e) =>
          onCheatcodesChange({
            ...cheatcodes,
            warp: { ...cheatcodes.warp, enabled: e.target.checked },
          }),
      }),
      React.createElement("span", null, "warp"),
    ),
  );

  // -- Inline section (always visible) --
  const inlineItems = [];

  // Fork block input
  inlineItems.push(
    React.createElement("input", {
      key: "forkBlock",
      type: "text",
      value: forkBlockNumber,
      onChange: (e) => onForkBlockChange(e.target.value),
      placeholder: "Block # (latest)",
      className: `${styles.simOptionInputSmall} ${fieldErrors.forkBlockNumber ? styles.inputError : ""}`,
      disabled: disabled,
    }),
  );

  // From address
  inlineItems.push(
    React.createElement(
      "div",
      {
        key: "fromAddress",
        className: styles.simOptionFromAddress,
        title: "Sender address to impersonate (prank) - simulates msg.sender",
      },
      React.createElement(AddressArgInput, {
        value: fromAddress,
        onChange: onFromAddressChange,
        addressBook: addressBook,
        disabled: disabled,
        placeholder: "From (prank)",
        onBookmarkClick: onOpenBookmarkModal,
        error: fieldErrors.fromAddress,
      }),
    ),
  );

  // State override buttons
  inlineItems.push(
    React.createElement(
      "button",
      {
        key: "addBalance",
        type: "button",
        className: styles.addOverrideBtn,
        onClick: () =>
          onBalanceOverridesChange([
            ...balanceOverrides,
            { address: "", balance: "" },
          ]),
        title: "Add balance override",
      },
      "+ Balance",
    ),
    React.createElement(
      "button",
      {
        key: "addStorage",
        type: "button",
        className: styles.addOverrideBtn,
        onClick: () =>
          onStorageOverridesChange([
            ...storageOverrides,
            { address: "", slot: "", value: "" },
          ]),
        title: "Add storage override",
      },
      "+ Storage",
    ),
  );

  // -- Expanded cheatcode rows (local sim) --
  const expandedCheatcodes =
    hasCheatcodesExpanded &&
    React.createElement(
      "div",
      {
        className: `${styles.simOptionsExpanded} ${styles.cheatcodesExpanded}`,
      },
      cheatcodes.deal.enabled &&
        React.createElement(
          "div",
          {
            className: `${styles.cheatcodeExpandedRow} ${styles.cheatcodeDealRow}`,
          },
          React.createElement(
            "span",
            {
              className: `${styles.cheatcodeLabel} ${styles.cheatcodeLabelDeal}`,
            },
            "vm.deal:",
          ),
          React.createElement("input", {
            type: "text",
            value: cheatcodes.deal.address,
            onChange: (e) =>
              onCheatcodesChange({
                ...cheatcodes,
                deal: { ...cheatcodes.deal, address: e.target.value },
              }),
            placeholder: "Address",
            className: `${styles.simOptionInput} ${fieldErrors.dealAddress ? styles.inputError : ""}`,
          }),
          React.createElement("input", {
            type: "text",
            value: cheatcodes.deal.amount,
            onChange: (e) =>
              onCheatcodesChange({
                ...cheatcodes,
                deal: { ...cheatcodes.deal, amount: e.target.value },
              }),
            placeholder: "ETH Amount",
            className: `${styles.simOptionInputSmall} ${fieldErrors.dealAmount ? styles.inputError : ""}`,
          }),
        ),
      cheatcodes.warp.enabled &&
        React.createElement(
          "div",
          {
            className: `${styles.cheatcodeExpandedRow} ${styles.cheatcodeWarpRow}`,
          },
          React.createElement(
            "span",
            {
              className: `${styles.cheatcodeLabel} ${styles.cheatcodeLabelWarp}`,
            },
            "vm.warp:",
          ),
          React.createElement("input", {
            type: "text",
            value: cheatcodes.warp.timestamp,
            onChange: (e) =>
              onCheatcodesChange({
                ...cheatcodes,
                warp: { ...cheatcodes.warp, timestamp: e.target.value },
              }),
            placeholder: "Unix Timestamp",
            className: `${styles.simOptionInputSmall} ${fieldErrors.warpTimestamp ? styles.inputError : ""}`,
          }),
        ),
    );

  return React.createElement(
    "div",
    { className: styles.simOptionsSection },
    // Header row
    React.createElement(
      "div",
      { className: styles.simOptionsHeader },
      React.createElement(
        "span",
        { className: styles.simOptionsLabel },
        "Simulation Options",
      ),
      React.createElement(
        "button",
        {
          onClick: onToggleExpanded,
          className: styles.simOptionsToggle,
          type: "button",
        },
        expanded ? "▼" : "▶",
      ),
      cheatcodeControls,
      React.createElement(
        "div",
        { className: styles.simOptionsInline },
        ...inlineItems,
      ),
    ),
    // Expanded cheatcodes
    expandedCheatcodes,
    // Balance overrides
    expanded &&
      balanceOverrides.length > 0 &&
      React.createElement(
        "div",
        { className: styles.simOptionsExpanded },
        React.createElement(
          "div",
          { className: styles.overridesLabel },
          "Balance Overrides:",
        ),
        ...balanceOverrides.map((override, index) =>
          React.createElement(
            "div",
            { key: index, className: styles.cheatcodeExpandedRow },
            React.createElement("input", {
              type: "text",
              value: override.address,
              onChange: (e) => {
                const next = balanceOverrides.map((o, i) =>
                  i === index ? { ...o, address: e.target.value } : o,
                );
                onBalanceOverridesChange(next);
              },
              placeholder: "Address (0x...)",
              className: styles.simOptionInput,
            }),
            React.createElement("input", {
              type: "text",
              value: override.balance,
              onChange: (e) => {
                const next = balanceOverrides.map((o, i) =>
                  i === index ? { ...o, balance: e.target.value } : o,
                );
                onBalanceOverridesChange(next);
              },
              placeholder: "ETH Balance",
              className: styles.simOptionInputSmall,
            }),
            React.createElement(
              "button",
              {
                type: "button",
                className: styles.removeOverrideBtn,
                onClick: () =>
                  onBalanceOverridesChange(
                    balanceOverrides.filter((_, i) => i !== index),
                  ),
                title: "Remove override",
              },
              "×",
            ),
          ),
        ),
      ),
    // Storage overrides
    expanded &&
      storageOverrides.length > 0 &&
      React.createElement(
        "div",
        { className: styles.simOptionsExpanded },
        React.createElement(
          "div",
          { className: styles.overridesLabel },
          "Storage Overrides:",
        ),
        ...storageOverrides.map((override, index) =>
          React.createElement(
            "div",
            { key: index, className: styles.cheatcodeExpandedRow },
            React.createElement("input", {
              type: "text",
              value: override.address,
              onChange: (e) => {
                const next = storageOverrides.map((o, i) =>
                  i === index ? { ...o, address: e.target.value } : o,
                );
                onStorageOverridesChange(next);
              },
              placeholder: "Contract (0x...)",
              className: styles.simOptionInput,
            }),
            React.createElement("input", {
              type: "text",
              value: override.slot,
              onChange: (e) => {
                const next = storageOverrides.map((o, i) =>
                  i === index ? { ...o, slot: e.target.value } : o,
                );
                onStorageOverridesChange(next);
              },
              placeholder: "Slot (0x...)",
              className: styles.simOptionInputSmall,
            }),
            React.createElement("input", {
              type: "text",
              value: override.value,
              onChange: (e) => {
                const next = storageOverrides.map((o, i) =>
                  i === index ? { ...o, value: e.target.value } : o,
                );
                onStorageOverridesChange(next);
              },
              placeholder: "Value (0x...)",
              className: styles.simOptionInputSmall,
            }),
            React.createElement(
              "button",
              {
                type: "button",
                className: styles.removeOverrideBtn,
                onClick: () =>
                  onStorageOverridesChange(
                    storageOverrides.filter((_, i) => i !== index),
                  ),
                title: "Remove override",
              },
              "×",
            ),
          ),
        ),
      ),
  );
}
