import React, { useState, useEffect } from "react";
import { BUILT_IN_CHAIN_IDS } from "../../utils/chains";
import styles from "./NetworkSelector.module.css";

/**
 * Searchable network picker with a sort toggle and a button to open the
 * Add Chain modal. Type in the input to fuzzy-filter chains by name or chain
 * ID; the Name / #ID toggle orders the results. The chosen chain is shown in
 * the input.
 *
 * @param {{
 *   chain: string,
 *   onChainChange: (chainKey: string) => void,
 *   allChains: Array<{ id: string, name: string, icon?: string, chainId?: number }>,
 *   onOpenAddChain: () => void,
 *   disabled: boolean,
 * }} props
 */
export default function NetworkSelector({
  chain,
  onChainChange,
  allChains,
  onOpenAddChain,
  disabled,
}) {
  const [sortBy, setSortBy] = useState("name");
  const [query, setQuery] = useState("");
  const [showList, setShowList] = useState(false);
  const [highlighted, setHighlighted] = useState(0);

  const chainIdOf = (c) => c.chainId || BUILT_IN_CHAIN_IDS[c.id] || 0;
  const displayOf = (c) => `${c.name} (${chainIdOf(c)})`;
  const selectedChain = allChains.find((c) => c.id === chain);

  useEffect(() => {
    if (selectedChain) setQuery(displayOf(selectedChain));
  }, [chain]);

  const isSelectionText = selectedChain && query === displayOf(selectedChain);
  const q = isSelectionText ? "" : query.trim().toLowerCase();
  const filtered = [...allChains]
    .sort((a, b) =>
      sortBy === "chainId"
        ? chainIdOf(a) - chainIdOf(b)
        : a.name.localeCompare(b.name),
    )
    .filter((c) => {
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) || String(chainIdOf(c)).includes(q)
      );
    });

  const activeIndex = Math.min(highlighted, filtered.length - 1);

  function handleInputChange(e) {
    setQuery(e.target.value);
    setShowList(true);
    setHighlighted(0);
  }

  function handleSelect(c) {
    onChainChange(c.id);
    setQuery(displayOf(c));
    setShowList(false);
  }

  function handleKeyDown(e) {
    if (!showList) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setShowList(true);
        setHighlighted(0);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (filtered[activeIndex]) {
        e.preventDefault();
        handleSelect(filtered[activeIndex]);
      }
    } else if (e.key === "Escape") {
      setShowList(false);
    }
  }

  return React.createElement(
    "div",
    { className: styles.chainSelectRow },
    React.createElement(
      "div",
      { className: styles.comboboxWrapper },
      React.createElement(
        "div",
        { className: styles.inputRow },
        selectedChain?.icon &&
          React.createElement("img", {
            src: selectedChain.icon,
            alt: "",
            className: styles.chainIconSmall,
            onError: (e) => {
              e.target.style.display = "none";
            },
          }),
        React.createElement("input", {
          type: "text",
          value: query,
          onChange: handleInputChange,
          onFocus: (e) => {
            setShowList(true);
            setHighlighted(0);
            e.target.select();
          },
          onBlur: () => setTimeout(() => setShowList(false), 150),
          onKeyDown: handleKeyDown,
          placeholder: "Search or select a network",
          className: styles.input,
          disabled,
          "aria-label": "Network",
          role: "combobox",
        }),
      ),
      showList &&
        React.createElement(
          "div",
          { className: styles.list },
          filtered.length === 0
            ? React.createElement(
                "div",
                { className: styles.noMatch },
                "No matching networks",
              )
            : filtered.map((c, i) =>
                React.createElement(
                  "div",
                  {
                    key: c.id,
                    className:
                      styles.listItem +
                      (i === activeIndex ? " " + styles.listItemActive : ""),
                    "data-chain": c.id,
                    onMouseDown: (e) => e.preventDefault(),
                    onMouseEnter: () => setHighlighted(i),
                    onClick: () => handleSelect(c),
                  },
                  React.createElement(
                    "span",
                    { className: styles.itemName },
                    c.name,
                  ),
                  React.createElement(
                    "span",
                    { className: styles.itemId },
                    String(chainIdOf(c)),
                  ),
                ),
              ),
        ),
    ),
    React.createElement(
      "div",
      { className: styles.sortToggle },
      React.createElement(
        "button",
        {
          type: "button",
          className:
            styles.sortBtn +
            (sortBy === "name" ? " " + styles.sortBtnActive : ""),
          onClick: () => {
            setSortBy("name");
            setHighlighted(0);
          },
          title: "Sort by name",
          disabled,
          onMouseDown: (e) => e.preventDefault(),
        },
        "Name",
      ),
      React.createElement(
        "button",
        {
          type: "button",
          className:
            styles.sortBtn +
            (sortBy === "chainId" ? " " + styles.sortBtnActive : ""),
          onClick: () => {
            setSortBy("chainId");
            setHighlighted(0);
          },
          title: "Sort by chain ID",
          disabled,
          onMouseDown: (e) => e.preventDefault(),
        },
        "#ID",
      ),
    ),
    React.createElement(
      "button",
      {
        onClick: onOpenAddChain,
        className: styles.addChainButton,
        title: "Add more networks",
        disabled,
      },
      "+",
    ),
  );
}
