import { describe, it, expect, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import NetworkSelector from "../../../app/contract-caller/components/NetworkSelector.js";

// ---------------------------------------------------------------------------
// Minimal render helper (mirrors pattern used by other tests in this dir)
// ---------------------------------------------------------------------------
function renderComponent(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(React.createElement(NetworkSelector, props));
  });
  return {
    container,
    cleanup() {
      document.body.removeChild(container);
    },
  };
}

const MOCK_CHAINS = [
  { id: "ethereum", name: "Ethereum", icon: "https://example.com/eth.jpg" },
  { id: "arbitrum", name: "Arbitrum", icon: "https://example.com/arb.jpg" },
  { id: "base", name: "Base", icon: "https://example.com/base.jpg" },
];

function optionValues(container) {
  return Array.from(container.querySelectorAll("option")).map((o) => o.value);
}

function selectOption(container, value) {
  const select = container.querySelector("select");
  act(() => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

const BASE_PROPS = {
  chain: "ethereum",
  onChainChange: () => {},
  allChains: MOCK_CHAINS,
  onOpenAddChain: () => {},
  disabled: false,
};

describe("NetworkSelector", () => {
  it("renders a select with a sort optgroup followed by one option per chain", () => {
    const { container, cleanup } = renderComponent(BASE_PROPS);

    const select = container.querySelector("select");
    expect(select).not.toBeNull();
    const group = select.querySelector("optgroup");
    expect(group).not.toBeNull();
    expect(group.label).toBe("Sort networks");
    expect(group.querySelectorAll("option")).toHaveLength(2);
    expect(select.querySelectorAll("option")).toHaveLength(
      MOCK_CHAINS.length + 2,
    );

    cleanup();
  });

  it("sorts options by name by default", () => {
    const { container, cleanup } = renderComponent(BASE_PROPS);
    // sort options first, then Arbitrum, Base, Ethereum
    expect(optionValues(container)).toEqual([
      "sort:name",
      "sort:chainId",
      "arbitrum",
      "base",
      "ethereum",
    ]);
    cleanup();
  });

  it("sorts options by chain ID when the sort option is picked", () => {
    const { container, cleanup } = renderComponent(BASE_PROPS);
    selectOption(container, "sort:chainId");
    // sort options first, then Ethereum(1), Base(8453), Arbitrum(42161)
    expect(optionValues(container)).toEqual([
      "sort:name",
      "sort:chainId",
      "ethereum",
      "base",
      "arbitrum",
    ]);
    expect(container.querySelector("select").value).toBe("sort:chainId");
    cleanup();
  });

  it("sorts custom chains by their own chainId field", () => {
    const allChains = [
      ...MOCK_CHAINS,
      { id: "chain-999", name: "Zeta", chainId: 999 },
      { id: "chain-10", name: "Alpha", chainId: 10 },
    ];
    const { container, cleanup } = renderComponent({
      ...BASE_PROPS,
      allChains,
    });
    selectOption(container, "sort:chainId");
    // sort options first, then ethereum(1), Alpha(10), chain-999(999), Base(8453), Arbitrum(42161)
    expect(optionValues(container)).toEqual([
      "sort:name",
      "sort:chainId",
      "ethereum",
      "chain-10",
      "chain-999",
      "base",
      "arbitrum",
    ]);
    cleanup();
  });

  it("switches back to name sort after picking the chain ID sort", () => {
    const { container, cleanup } = renderComponent(BASE_PROPS);
    selectOption(container, "sort:chainId");
    selectOption(container, "sort:name");
    expect(optionValues(container)).toEqual([
      "sort:name",
      "sort:chainId",
      "arbitrum",
      "base",
      "ethereum",
    ]);
    cleanup();
  });

  it("selecting a chain calls onChainChange and shows it as the header", () => {
    const onChainChange = vi.fn();
    const { container, cleanup } = renderComponent({
      ...BASE_PROPS,
      onChainChange,
    });
    selectOption(container, "sort:chainId");
    selectOption(container, "base");
    expect(onChainChange).toHaveBeenCalledWith("base");
    expect(container.querySelector("select").value).toBe("base");
    cleanup();
  });

  it("sets the select value to the current chain", () => {
    const { container, cleanup } = renderComponent({
      chain: "arbitrum",
      onChainChange: () => {},
      allChains: MOCK_CHAINS,
      onOpenAddChain: () => {},
      disabled: false,
    });

    const select = container.querySelector("select");
    expect(select.value).toBe("arbitrum");

    cleanup();
  });

  it("renders the add chain button with + label", () => {
    const { container, cleanup } = renderComponent(BASE_PROPS);

    const button = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "+",
    );
    expect(button).not.toBeUndefined();
    expect(button.textContent).toBe("+");

    cleanup();
  });

  it("calls onOpenAddChain when the add button is clicked", () => {
    const onOpenAddChain = vi.fn();
    const { container, cleanup } = renderComponent({
      ...BASE_PROPS,
      onOpenAddChain,
    });

    const button = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "+",
    );
    act(() => {
      button.click();
    });

    expect(onOpenAddChain).toHaveBeenCalledOnce();

    cleanup();
  });

  it("disables select and all buttons when disabled=true", () => {
    const { container, cleanup } = renderComponent({
      ...BASE_PROPS,
      disabled: true,
    });

    const select = container.querySelector("select");
    const buttons = container.querySelectorAll("button");
    expect(select.disabled).toBe(true);
    expect(buttons.length).toBeGreaterThan(0);
    buttons.forEach((button) => {
      expect(button.disabled).toBe(true);
    });

    cleanup();
  });
});
