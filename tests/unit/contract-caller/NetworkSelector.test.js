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

describe("NetworkSelector", () => {
  it("renders a select with one option per chain", () => {
    const { container, cleanup } = renderComponent({
      chain: "ethereum",
      onChainChange: () => {},
      allChains: MOCK_CHAINS,
      onOpenAddChain: () => {},
      disabled: false,
    });

    const select = container.querySelector("select");
    expect(select).not.toBeNull();
    expect(select.querySelectorAll("option")).toHaveLength(MOCK_CHAINS.length);

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
    const { container, cleanup } = renderComponent({
      chain: "ethereum",
      onChainChange: () => {},
      allChains: MOCK_CHAINS,
      onOpenAddChain: () => {},
      disabled: false,
    });

    const button = container.querySelector("button");
    expect(button).not.toBeNull();
    expect(button.textContent).toBe("+");

    cleanup();
  });

  it("calls onOpenAddChain when the add button is clicked", () => {
    const onOpenAddChain = vi.fn();
    const { container, cleanup } = renderComponent({
      chain: "ethereum",
      onChainChange: () => {},
      allChains: MOCK_CHAINS,
      onOpenAddChain,
      disabled: false,
    });

    const button = container.querySelector("button");
    act(() => {
      button.click();
    });

    expect(onOpenAddChain).toHaveBeenCalledOnce();

    cleanup();
  });

  it("disables both select and button when disabled=true", () => {
    const { container, cleanup } = renderComponent({
      chain: "ethereum",
      onChainChange: () => {},
      allChains: MOCK_CHAINS,
      onOpenAddChain: () => {},
      disabled: true,
    });

    const select = container.querySelector("select");
    const button = container.querySelector("button");
    expect(select.disabled).toBe(true);
    expect(button.disabled).toBe(true);

    cleanup();
  });
});
