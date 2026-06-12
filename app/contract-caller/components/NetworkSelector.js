import React from "react";
import { BUILT_IN_CHAIN_IDS } from "../../utils/chains";
import styles from "./NetworkSelector.module.css";

/**
 * Chain dropdown with icon and a button to open the Add Chain modal.
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
  const selectedChain = allChains.find((c) => c.id === chain);
  const sortedChains = [...allChains].sort((a, b) =>
    a.name.localeCompare(b.name),
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
          const chainIdNum = c.chainId || BUILT_IN_CHAIN_IDS[c.id];
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
