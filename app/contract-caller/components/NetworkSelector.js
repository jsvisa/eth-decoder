import React, { useState, useEffect } from "react";
import { BUILT_IN_CHAIN_IDS } from "../../utils/chains";
import styles from "./NetworkSelector.module.css";

const SORT_OPTIONS = [
  { value: "sort:name", label: "Sort by name" },
  { value: "sort:chainId", label: "Sort by chain ID" },
];

/**
 * Chain dropdown with icon, an in-dropdown sort control, and a button to open
 * the Add Chain modal. The sort options live at the top of the select; picking
 * one re-sorts the chain list and shows as the header until a chain is chosen.
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
  const [selectValue, setSelectValue] = useState(chain);
  useEffect(() => {
    setSelectValue(chain);
  }, [chain]);

  const selectedChain = allChains.find((c) => c.id === selectValue);
  const chainIdOf = (c) => c.chainId || BUILT_IN_CHAIN_IDS[c.id] || 0;
  const sortedChains = [...allChains].sort((a, b) =>
    sortBy === "chainId"
      ? chainIdOf(a) - chainIdOf(b)
      : a.name.localeCompare(b.name),
  );

  const handleChange = (value) => {
    if (value.startsWith("sort:")) {
      setSortBy(value.slice("sort:".length));
      setSelectValue(value);
    } else {
      setSelectValue(value);
      onChainChange(value);
    }
  };

  return React.createElement(
    "div",
    { className: styles.chainSelectRow },
    React.createElement(
      "div",
      { className: styles.chainSelectWithIcon },
      selectedChain?.icon &&
        React.createElement("img", {
          src: selectedChain.icon,
          alt: "",
          className: styles.chainIconSmall,
          onError: (e) => {
            e.target.style.display = "none";
          },
        }),
      React.createElement(
        "select",
        {
          value: selectValue,
          onChange: (e) => handleChange(e.target.value),
          className: styles.select,
          disabled,
        },
        ...SORT_OPTIONS.map((opt) =>
          React.createElement(
            "option",
            { key: opt.value, value: opt.value },
            opt.label,
          ),
        ),
        ...sortedChains.map((c) => {
          const chainIdNum = chainIdOf(c);
          return React.createElement(
            "option",
            { key: c.id, value: c.id },
            `${c.name} (${chainIdNum})`,
          );
        }),
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
