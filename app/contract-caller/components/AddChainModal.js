"use client";

import React from "react";
import styles from "./AddChainModal.module.css";

export default function AddChainModal({
  open,
  onClose,
  search,
  onSearchChange,
  customChains,
  addedCollapsed,
  onToggleAddedCollapsed,
  chainlistData,
  loading,
  error,
  onAddChain,
  onRemoveChain,
  isChainAdded,
}) {
  if (!open) return null;

  // Added chains section
  const addedChainsSection =
    customChains.length > 0
      ? React.createElement(
          "div",
          { className: styles.addedChainsSection },
          React.createElement(
            "button",
            {
              className: styles.addedChainsHeader,
              onClick: onToggleAddedCollapsed,
            },
            React.createElement(
              "span",
              { className: styles.collapseIcon },
              addedCollapsed ? "▶" : "▼",
            ),
            React.createElement(
              "span",
              { className: styles.modalLabel },
              "Added Networks (" + customChains.length + ")",
            ),
          ),
          !addedCollapsed
            ? React.createElement(
                "div",
                { className: styles.addedChainsList },
                customChains.map((c) =>
                  React.createElement(
                    "div",
                    { key: c.id, className: styles.addedChainItem },
                    c.icon
                      ? React.createElement("img", {
                          src: c.icon,
                          alt: "",
                          className: styles.chainIconTiny,
                        })
                      : null,
                    React.createElement(
                      "span",
                      { className: styles.addedChainName },
                      c.name,
                    ),
                    React.createElement(
                      "span",
                      { className: styles.addedChainId },
                      "#" + c.chainId,
                    ),
                    React.createElement(
                      "button",
                      {
                        onClick: (e) => {
                          e.stopPropagation();
                          onRemoveChain(c.id);
                        },
                        className: styles.removeChainButton,
                        title: "Remove",
                      },
                      "\xD7",
                    ),
                  ),
                ),
              )
            : null,
        )
      : null;

  // Chainlist entries list
  const chainlistItems = chainlistData.map((chainEntry) => {
    const added = isChainAdded(chainEntry);
    return React.createElement(
      "div",
      {
        key: chainEntry.chainId,
        className:
          styles.chainlistItem + (added ? " " + styles.chainlistItemAdded : ""),
        onClick: () => {
          if (!added) onAddChain(chainEntry);
        },
      },
      chainEntry.icon
        ? React.createElement("img", {
            src:
              "https://icons.llamao.fi/icons/chains/rsz_" +
              chainEntry.icon +
              ".jpg",
            alt: "",
            className: styles.chainIconSmall,
            onError: (e) => {
              e.target.style.display = "none";
            },
          })
        : null,
      React.createElement(
        "div",
        { className: styles.chainlistItemInfo },
        React.createElement(
          "span",
          { className: styles.chainlistItemName },
          chainEntry.name,
        ),
        React.createElement(
          "span",
          { className: styles.chainlistItemMeta },
          "Chain ID: " +
            chainEntry.chainId +
            (chainEntry.nativeCurrency
              ? " • " + chainEntry.nativeCurrency.symbol
              : ""),
        ),
      ),
      added
        ? React.createElement(
            "span",
            { className: styles.chainlistItemAdded },
            "Added",
          )
        : React.createElement(
            "button",
            { className: styles.addChainItemButton },
            "+ Add",
          ),
    );
  });

  const emptyMessage =
    chainlistData.length === 0 && !loading
      ? React.createElement(
          "div",
          { className: styles.chainlistEmpty },
          search
            ? "No networks found matching your search."
            : "No networks available.",
        )
      : null;

  const chainlistSection = React.createElement(
    "div",
    { className: styles.chainlistSection },
    React.createElement(
      "label",
      { className: styles.modalLabel },
      "Available Networks",
      loading
        ? React.createElement(
            "span",
            { className: styles.loadingText },
            " (Loading...)",
          )
        : null,
    ),
    error
      ? React.createElement("div", { className: styles.chainlistError }, error)
      : null,
    !loading && !error
      ? React.createElement(
          "div",
          { className: styles.chainlistResults },
          chainlistItems,
          emptyMessage,
        )
      : null,
  );

  return React.createElement(
    "div",
    {
      className: styles.modalOverlay,
      onClick: onClose,
      onKeyDown: (e) => {
        if (e.key === "Escape") onClose();
      },
      tabIndex: -1,
    },
    React.createElement(
      "div",
      {
        className: styles.chainModal,
        onClick: (e) => e.stopPropagation(),
      },
      React.createElement(
        "h3",
        { className: styles.modalTitle },
        "Add Network",
      ),
      React.createElement(
        "div",
        { className: styles.modalBody },
        React.createElement(
          "div",
          { className: styles.modalField },
          React.createElement("input", {
            type: "text",
            value: search,
            onChange: (e) => onSearchChange(e.target.value),
            placeholder: "Search networks by name or chain ID...",
            className: styles.modalInput,
          }),
        ),
        addedChainsSection,
        chainlistSection,
      ),
      React.createElement(
        "div",
        { className: styles.modalActions },
        React.createElement(
          "button",
          {
            onClick: onClose,
            className: styles.modalCancelButton,
            type: "button",
          },
          "Close",
        ),
      ),
    ),
  );
}
