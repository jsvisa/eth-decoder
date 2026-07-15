import React, { useState } from "react";
import styles from "./AbiPanel.module.css";
import { isReadOnly } from "../utils/functionArgs";

// Format an ABI entry for display: "name(type arg, ...) → outType"
function formatAbiSignature(item) {
  const inputs =
    item.inputs
      ?.map((i) => `${i.type}${i.name ? " " + i.name : ""}`)
      .join(", ") || "";
  if (item.type === "function") {
    const outputs = item.outputs?.map((o) => o.type).join(", ") || "";
    return `${item.name}(${inputs})${outputs ? ` → ${outputs}` : ""}`;
  }
  return `${item.name || item.type}(${inputs})`;
}

// Filter and group parsed ABI entries by search term
function getFilteredAbiEntries(parsedAbi, filter) {
  if (!parsedAbi || !Array.isArray(parsedAbi)) {
    return { functions: [], events: [], errors: [], other: [] };
  }
  const search = filter.toLowerCase().trim();
  const filtered = search
    ? parsedAbi.filter((item) => {
        const name = item.name?.toLowerCase() || "";
        const type = item.type?.toLowerCase() || "";
        const inputs =
          item.inputs
            ?.map((i) => `${i.name} ${i.type}`)
            .join(" ")
            .toLowerCase() || "";
        const outputs =
          item.outputs
            ?.map((o) => `${o.name} ${o.type}`)
            .join(" ")
            .toLowerCase() || "";
        return (
          name.includes(search) ||
          type.includes(search) ||
          inputs.includes(search) ||
          outputs.includes(search)
        );
      })
    : parsedAbi;

  return {
    functions: filtered.filter((item) => item.type === "function"),
    events: filtered.filter((item) => item.type === "event"),
    errors: filtered.filter((item) => item.type === "error"),
    other: filtered.filter(
      (item) => !["function", "event", "error"].includes(item.type),
    ),
  };
}

/**
 * Render a group of ABI entries (functions, events, errors, other) as a
 * collapsible category with per-entry copy-to-clipboard support.
 */
function renderGroup(
  items,
  categoryLabel,
  makeKey,
  renderBadge,
  itemClassName,
  copiedItem,
  onCopy,
  styles,
) {
  if (!items.length) return null;
  return React.createElement(
    "div",
    { className: styles.abiCategory },
    React.createElement(
      "div",
      { className: styles.abiCategoryHeader },
      React.createElement(
        "span",
        { className: styles.abiCategoryLabel },
        categoryLabel,
      ),
      React.createElement(
        "span",
        { className: styles.abiCategoryCount },
        items.length,
      ),
    ),
    React.createElement(
      "div",
      { className: styles.abiCategoryItems },
      ...items.map((item, idx) => {
        const itemKey = makeKey(item, idx);
        const isCopied = copiedItem === itemKey;
        const classes = [
          styles.abiItem,
          styles.abiClickable,
          itemClassName(item),
          isCopied ? styles.abiCopied : "",
        ]
          .filter(Boolean)
          .join(" ");
        return React.createElement(
          "div",
          {
            key: idx,
            className: classes,
            onClick: () => onCopy(item, itemKey),
            title: `Click to copy ${item.name || item.type}`,
          },
          React.createElement(
            "span",
            { className: styles.abiItemBadge },
            renderBadge(item),
          ),
          React.createElement(
            "span",
            { className: styles.abiItemSignature },
            formatAbiSignature(item),
          ),
          isCopied
            ? React.createElement(
                "span",
                { className: styles.abiCopiedBadge },
                "Copied!",
              )
            : null,
        );
      }),
    ),
  );
}

/**
 * AbiPanel — collapsible ABI viewer with List/Raw toggle, search filter,
 * per-entry copy, raw textarea editor, and Save-to-cache action.
 *
 * Props:
 *   abi          {string}            Raw ABI JSON text
 *   onAbiChange  {(s:string)=>void}  Edit raw ABI
 *   parsedAbi    {AbiItem[]|null}    Parsed ABI for list view
 *   abiSource    {string|null}       Where ABI was loaded from (etherscan/sourcify/manual)
 *   abiSaved     {boolean}           Show 'Saved' feedback
 *   onSaveAbi    {()=>void}          Persist edited ABI to cache
 *   onRefetchAbi {()=>void}          Force-refresh ABI from explorer
 *   loading      {boolean}           Disabled while a call is in flight
 */
export default function AbiPanel({
  abi,
  onAbiChange,
  parsedAbi,
  abiSource,
  abiSaved,
  onSaveAbi,
  onRefetchAbi,
  loading,
}) {
  const [collapsed, setCollapsed] = useState(true);
  const [viewMode, setViewMode] = useState("list");
  const [filter, setFilter] = useState("");
  const [copiedItem, setCopiedItem] = useState(null);

  const handleCopyEntry = async (item, itemKey) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(item, null, 2));
      setCopiedItem(itemKey);
      setTimeout(() => setCopiedItem(null), 1500);
    } catch (err) {
      console.error("Failed to copy ABI entry:", err);
    }
  };

  const entries = getFilteredAbiEntries(parsedAbi, filter);

  // Label row
  const labelRow = React.createElement(
    "div",
    { className: styles.abiLabelRow },
    React.createElement("label", { className: styles.label }, "ABI (JSON)"),
    React.createElement(
      "button",
      {
        onClick: () => setCollapsed(!collapsed),
        className: styles.abiCollapseBtn,
        type: "button",
      },
      collapsed ? "▶ Expand" : "▼ Collapse",
    ),
    abi
      ? React.createElement(
          "button",
          {
            onClick: onSaveAbi,
            className: styles.abiSaveBtn + (abiSaved ? " " + styles.saved : ""),
            type: "button",
            title: "Save ABI to local cache",
            disabled: loading,
          },
          abiSaved ? "✓ Saved" : "Save",
        )
      : null,
    abiSource
      ? React.createElement(
          "span",
          { className: styles.abiSource },
          abiSource,
          React.createElement(
            "button",
            {
              onClick: onRefetchAbi,
              className: styles.refreshButton,
              disabled: loading,
              title: "Refresh ABI from explorer",
            },
            "↻",
          ),
        )
      : null,
  );

  if (collapsed) {
    return React.createElement("div", { className: styles.field }, labelRow);
  }

  // Toolbar: List/Raw toggle + search
  const toolbar = React.createElement(
    "div",
    { className: styles.abiToolbar },
    React.createElement(
      "div",
      { className: styles.abiViewToggle },
      React.createElement(
        "button",
        {
          type: "button",
          className:
            styles.abiViewBtn +
            (viewMode === "list" ? " " + styles.active : ""),
          onClick: () => setViewMode("list"),
        },
        "List",
      ),
      React.createElement(
        "button",
        {
          type: "button",
          className:
            styles.abiViewBtn + (viewMode === "raw" ? " " + styles.active : ""),
          onClick: () => setViewMode("raw"),
        },
        "Raw",
      ),
    ),
    viewMode === "list" && parsedAbi
      ? React.createElement("input", {
          type: "text",
          value: filter,
          onChange: (e) => setFilter(e.target.value),
          placeholder: "Search functions, events, types...",
          className: styles.abiSearchInput,
        })
      : null,
  );

  // List view content
  let listView = null;
  if (viewMode === "list" && parsedAbi) {
    const totalCount =
      entries.functions.length +
      entries.events.length +
      entries.errors.length +
      entries.other.length;

    let listBody;
    if (totalCount === 0) {
      listBody = React.createElement(
        "div",
        { className: styles.abiEmptyState },
        filter ? "No matching entries" : "No ABI entries",
      );
    } else {
      listBody = React.createElement(
        React.Fragment,
        null,
        renderGroup(
          entries.functions,
          "Functions",
          (item, idx) => `func-${item.name}-${idx}`,
          (item) => (isReadOnly(item) ? "R" : "W"),
          (item) => (isReadOnly(item) ? styles.abiRead : styles.abiWrite),
          copiedItem,
          handleCopyEntry,
          styles,
        ),
        renderGroup(
          entries.events,
          "Events",
          (item, idx) => `event-${item.name}-${idx}`,
          () => "E",
          () => styles.abiEvent,
          copiedItem,
          handleCopyEntry,
          styles,
        ),
        renderGroup(
          entries.errors,
          "Errors",
          (item, idx) => `error-${item.name}-${idx}`,
          () => "!",
          () => styles.abiError,
          copiedItem,
          handleCopyEntry,
          styles,
        ),
        renderGroup(
          entries.other,
          "Other",
          (item, idx) => `other-${item.type}-${idx}`,
          (item) => item.type?.[0]?.toUpperCase() || "?",
          () => styles.abiOther,
          copiedItem,
          handleCopyEntry,
          styles,
        ),
      );
    }

    listView = React.createElement(
      "div",
      { className: styles.abiListView },
      listBody,
    );
  }

  // Raw view (shown when mode is raw OR when parsedAbi is null/undefined)
  const rawView =
    viewMode === "raw" || !parsedAbi
      ? React.createElement("textarea", {
          value: abi,
          onChange: (e) => onAbiChange(e.target.value),
          placeholder: "Paste contract ABI here or use Fetch ABI button...",
          className: styles.textarea,
          disabled: loading,
          rows: 6,
        })
      : null;

  return React.createElement(
    "div",
    { className: styles.field },
    labelRow,
    React.createElement(
      "div",
      { className: styles.abiContent },
      toolbar,
      listView,
      rawView,
    ),
  );
}
