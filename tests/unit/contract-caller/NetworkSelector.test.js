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

const BASE_PROPS = {
  chain: "ethereum",
  onChainChange: () => {},
  allChains: MOCK_CHAINS,
  onOpenAddChain: () => {},
  disabled: false,
};

describe("NetworkSelector", () => {
  it("renders a select with one option per chain", () => {
    const { container, cleanup } = renderComponent(BASE_PROPS);

    const select = container.querySelector("select");
    expect(select).not.toBeNull();
    expect(select.querySelectorAll("option")).toHaveLength(MOCK_CHAINS.length);

    cleanup();
  });

  it("sorts options by name by default", () => {
    const { container, cleanup } = renderComponent(BASE_PROPS);
    // Arbitrum, Base, Ethereum
    expect(optionValues(container)).toEqual(["arbitrum", "base", "ethereum"]);
    cleanup();
  });

  it("renders the sort toggle and add buttons", () => {
    const { container, cleanup } = renderComponent(BASE_PROPS);
    const labels = Array.from(container.querySelectorAll("button")).map(
      (b) => b.textContent,
    );
    expect(labels).toContain("Name");
    expect(labels).toContain("#ID");
    expect(labels).toContain("+");
    cleanup();
  });

  it("sorts options by chain ID when #ID is selected", () => {
    const { container, cleanup } = renderComponent(BASE_PROPS);
    const idBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "#ID",
    );
    act(() => {
      idBtn.click();
    });
    // Ethereum(1), Base(8453), Arbitrum(42161)
    expect(optionValues(container)).toEqual(["ethereum", "base", "arbitrum"]);
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
    const idBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "#ID",
    );
    act(() => {
      idBtn.click();
    });
    // ethereum(1), Alpha(10), chain-999(999), Base(8453), Arbitrum(42161)
    expect(optionValues(container)).toEqual([
      "ethereum",
      "chain-10",
      "chain-999",
      "base",
      "arbitrum",
    ]);
    cleanup();
  });

  it("switches back to name sort after toggling", () => {
    const { container, cleanup } = renderComponent(BASE_PROPS);
    const idBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "#ID",
    );
    const nameBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Name",
    );
    act(() => {
      idBtn.click();
    });
    act(() => {
      nameBtn.click();
    });
    expect(optionValues(container)).toEqual(["arbitrum", "base", "ethereum"]);
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
