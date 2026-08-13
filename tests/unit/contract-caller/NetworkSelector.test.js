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

const BASE_PROPS = {
  chain: "ethereum",
  onChainChange: () => {},
  allChains: MOCK_CHAINS,
  onOpenAddChain: () => {},
  disabled: false,
};

function inputOf(container) {
  return container.querySelector("input");
}

function openList(container) {
  act(() => {
    inputOf(container).focus();
  });
}

function typeText(container, text) {
  const input = inputOf(container);
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  ).set;
  act(() => {
    setter.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function chainIds(container) {
  return Array.from(container.querySelectorAll("[data-chain]")).map(
    (el) => el.dataset.chain,
  );
}

function clickByLabel(container, label) {
  return Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent === label,
  );
}

describe("NetworkSelector", () => {
  it("renders a search input, sort toggle and add buttons", () => {
    const { container, cleanup } = renderComponent(BASE_PROPS);

    expect(inputOf(container)).not.toBeNull();
    const labels = Array.from(container.querySelectorAll("button")).map(
      (b) => b.textContent,
    );
    expect(labels).toEqual(["Name", "#ID", "+"]);

    cleanup();
  });

  it("shows the current chain in the input", () => {
    const { container, cleanup } = renderComponent(BASE_PROPS);
    expect(inputOf(container).value).toBe("Ethereum (1)");
    cleanup();
  });

  it("sorts list by name by default", () => {
    const { container, cleanup } = renderComponent(BASE_PROPS);
    openList(container);
    // Arbitrum, Base, Ethereum
    expect(chainIds(container)).toEqual(["arbitrum", "base", "ethereum"]);
    cleanup();
  });

  it("sorts list by chain ID when #ID is selected", () => {
    const { container, cleanup } = renderComponent(BASE_PROPS);
    openList(container);
    act(() => {
      clickByLabel(container, "#ID").click();
    });
    // Ethereum(1), Base(8453), Arbitrum(42161)
    expect(chainIds(container)).toEqual(["ethereum", "base", "arbitrum"]);
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
    openList(container);
    act(() => {
      clickByLabel(container, "#ID").click();
    });
    // ethereum(1), Alpha(10), chain-999(999), Base(8453), Arbitrum(42161)
    expect(chainIds(container)).toEqual([
      "ethereum",
      "chain-10",
      "chain-999",
      "base",
      "arbitrum",
    ]);
    cleanup();
  });

  it("switches back to name sort after picking chain ID sort", () => {
    const { container, cleanup } = renderComponent(BASE_PROPS);
    openList(container);
    act(() => {
      clickByLabel(container, "#ID").click();
    });
    act(() => {
      clickByLabel(container, "Name").click();
    });
    expect(chainIds(container)).toEqual(["arbitrum", "base", "ethereum"]);
    cleanup();
  });

  it("filters chains by name", () => {
    const { container, cleanup } = renderComponent(BASE_PROPS);
    openList(container);
    typeText(container, "arb");
    expect(chainIds(container)).toEqual(["arbitrum"]);
    cleanup();
  });

  it("filters chains by chain ID", () => {
    const { container, cleanup } = renderComponent(BASE_PROPS);
    openList(container);
    typeText(container, "8453");
    expect(chainIds(container)).toEqual(["base"]);
    cleanup();
  });

  it("shows a no-match message when nothing matches", () => {
    const { container, cleanup } = renderComponent(BASE_PROPS);
    openList(container);
    typeText(container, "xyz");
    expect(chainIds(container)).toEqual([]);
    expect(container.textContent).toContain("No matching networks");
    cleanup();
  });

  it("selecting a chain calls onChainChange and shows it in the input", () => {
    const onChainChange = vi.fn();
    const { container, cleanup } = renderComponent({
      ...BASE_PROPS,
      onChainChange,
    });
    openList(container);
    const item = Array.from(container.querySelectorAll("[data-chain]")).find(
      (el) => el.dataset.chain === "base",
    );
    act(() => {
      item.click();
    });
    expect(onChainChange).toHaveBeenCalledWith("base");
    expect(inputOf(container).value).toBe("Base (8453)");
    cleanup();
  });

  it("renders the add chain button with + label", () => {
    const { container, cleanup } = renderComponent(BASE_PROPS);
    const button = clickByLabel(container, "+");
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
    act(() => {
      clickByLabel(container, "+").click();
    });
    expect(onOpenAddChain).toHaveBeenCalledOnce();
    cleanup();
  });

  it("disables input and all buttons when disabled=true", () => {
    const { container, cleanup } = renderComponent({
      ...BASE_PROPS,
      disabled: true,
    });

    expect(inputOf(container).disabled).toBe(true);
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThan(0);
    buttons.forEach((button) => {
      expect(button.disabled).toBe(true);
    });

    cleanup();
  });
});
