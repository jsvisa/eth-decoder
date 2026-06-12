"use client";

import React, { useState } from "react";
import { isValidEthAddress } from "../../utils/validation.js";
import styles from "./ContractAddressInput.module.css";

const h = React.createElement;

/**
 * ContractAddressInput — address field with autocomplete, bookmark star,
 * detect-proxy checkbox, and Fetch ABI button.
 *
 * Props:
 *   address             {string}
 *   onAddressChange     {(addr: string) => void}
 *   addressBook         {Array<{address, label}>}
 *   cachedAddresses     {Array<{chain, address, contractName, implContractName, isProxy}>}
 *   contractName        {string|null}
 *   detectProxy         {boolean}
 *   onDetectProxyChange {(b: boolean) => void}
 *   onFetchAbi          {(opts?) => void}
 *   fetchingAbi         {boolean}
 *   fieldError          {string|null}
 *   onOpenBookmarkModal {(addr: string) => void}
 *   disabled            {boolean}
 */
export default function ContractAddressInput({
  address,
  onAddressChange,
  addressBook,
  cachedAddresses,
  contractName,
  detectProxy,
  onDetectProxyChange,
  onFetchAbi,
  fetchingAbi,
  fieldError,
  onOpenBookmarkModal,
  disabled,
}) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [addressFilter, setAddressFilter] = useState("");

  const bookmark =
    address &&
    addressBook.find(
      (item) => item.address.toLowerCase() === address.toLowerCase(),
    );
  const isBookmarked = Boolean(bookmark?.label);

  // Merge bookmarked addresses and cached addresses into a single list.
  const suggestions = (() => {
    const bookmarked = addressBook.map((item) => ({
      ...item,
      isBookmarked: true,
    }));
    const cached = (cachedAddresses || []).map((item) => ({
      ...item,
      isBookmarked: false,
    }));
    const seen = new Set(bookmarked.map((b) => b.address.toLowerCase()));
    return [
      ...bookmarked,
      ...cached.filter((c) => !seen.has(c.address.toLowerCase())),
    ];
  })();

  const filteredSuggestions = suggestions.filter((item) => {
    if (!addressFilter) return true;
    const f = addressFilter.toLowerCase();
    return (
      item.address.toLowerCase().includes(f) ||
      (item.contractName && item.contractName.toLowerCase().includes(f)) ||
      (item.implContractName &&
        item.implContractName.toLowerCase().includes(f)) ||
      (item.label && item.label.toLowerCase().includes(f))
    );
  });

  function handleInputChange(e) {
    const val = e.target.value;
    onAddressChange(val);
    setAddressFilter(val);
    setShowSuggestions(true);
  }

  function handleSelectSuggestion(addr) {
    onAddressChange(addr);
    setShowSuggestions(false);
  }

  return h(
    "div",
    { className: styles.field },

    // Label row
    h(
      "div",
      { className: styles.addressLabelRow },
      h("label", { className: styles.label }, "Contract Address"),
      isBookmarked && bookmark.label
        ? h("span", { className: styles.bookmarkName }, bookmark.label)
        : null,
      contractName
        ? h("span", { className: styles.contractName }, contractName)
        : null,
    ),

    // Input row
    h(
      "div",
      { className: styles.addressRow },

      // Wrapper with autocomplete dropdown
      h(
        "div",
        { className: styles.addressInputWrapper },
        h("input", {
          type: "text",
          value: address,
          onChange: handleInputChange,
          onFocus: () => setShowSuggestions(true),
          onBlur: () => setTimeout(() => setShowSuggestions(false), 200),
          placeholder: "0x...",
          className: styles.input + (fieldError ? " " + styles.inputError : ""),
          disabled,
          "aria-label": "Contract Address",
        }),
        showSuggestions && filteredSuggestions.length > 0
          ? h(
              "div",
              { className: styles.addressSuggestions },
              filteredSuggestions.map((item, idx) =>
                h(
                  "div",
                  {
                    key: idx,
                    className: styles.addressSuggestionItem,
                    onClick: () => handleSelectSuggestion(item.address),
                  },
                  item.isBookmarked
                    ? h("span", { className: styles.bookmarkStar }, "★")
                    : null,
                  h(
                    "span",
                    { className: styles.suggestionName },
                    (item.label || item.contractName || "Unknown") +
                      (item.isProxy && item.implContractName
                        ? " → " + item.implContractName
                        : ""),
                  ),
                  h(
                    "span",
                    { className: styles.suggestionAddress },
                    item.address.slice(0, 10) + "..." + item.address.slice(-8),
                  ),
                ),
              ),
            )
          : null,
      ),

      // Bookmark star button
      h(
        "button",
        {
          type: "button",
          onClick: () => onOpenBookmarkModal(address),
          className:
            styles.bookmarkButton +
            (isBookmarked ? " " + styles.bookmarked : ""),
          disabled: disabled || !isValidEthAddress(address),
          title: isBookmarked ? "Edit bookmark" : "Add to address book",
        },
        isBookmarked ? "★" : "☆",
      ),

      // Detect proxy checkbox
      h(
        "label",
        {
          className: styles.detectProxyLabel,
          title:
            "Use on-chain detection for proxy contracts not recognized by Etherscan (e.g. Safe, EIP-1167 clones)",
        },
        h("input", {
          type: "checkbox",
          checked: detectProxy,
          onChange: (e) => onDetectProxyChange(e.target.checked),
        }),
        "Detect proxy",
      ),

      // Fetch ABI button
      h(
        "button",
        {
          type: "button",
          onClick: () => onFetchAbi(),
          className: styles.fetchButton,
          disabled: disabled || fetchingAbi,
          "data-fetch-abi": "true",
        },
        fetchingAbi ? "Fetching..." : "Fetch ABI",
      ),
    ),

    // Field error message
    fieldError
      ? h("span", { className: styles.fieldErrorMsg }, fieldError)
      : null,
  );
}
