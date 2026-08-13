import React, { useState } from "react";
import { BUILT_IN_CHAIN_IDS } from "../../utils/chains";
import styles from "./NetworkSelector.module.css";

/**
 * Chain dropdown with icon, a sort toggle, and a button to open the Add Chain modal.
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
  const selectedChain = allChains.find((c) => c.id === chain);
  const chainIdOf = (c) => c.chainId || BUILT_IN_CHAIN_IDS[c.id] || 0;
  const sortedChains = [...allChains].sort((a, b) =>
    sortBy === "chainId"
      ? chainIdOf(a) - chainIdOf(b)
      : a.name.localeCompare(b.name),
  );

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
          value: chain,
          onChange: (e) => onChainChange(e.target.value),
          className: styles.select,
          disabled,
        },
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
      "div",
      { className: styles.sortToggle },
      React.createElement(
        "button",
        {
          type: "button",
          className:
            styles.sortBtn +
            (sortBy === "name" ? " " + styles.sortBtnActive : ""),
          onClick: () => setSortBy("name"),
          title: "Sort by name",
          disabled,
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
          onClick: () => setSortBy("chainId"),
          title: "Sort by chain ID",
          disabled,
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
