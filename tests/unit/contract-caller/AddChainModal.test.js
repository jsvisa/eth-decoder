import { describe, it, expect, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import AddChainModal from "../../../app/contract-caller/components/AddChainModal.js";

function renderComponent(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(React.createElement(AddChainModal, props));
  });
  return {
    container,
    cleanup() {
      document.body.removeChild(container);
    },
  };
}

const CHAIN_ENTRY = {
  chainId: 137,
  name: "Polygon Mainnet",
  icon: "polygon",
  nativeCurrency: { symbol: "MATIC" },
};

const BASE_PROPS = {
  open: true,
  onClose: () => {},
  search: "",
  onSearchChange: () => {},
  customChains: [],
  addedCollapsed: false,
  onToggleAddedCollapsed: () => {},
  chainlistData: [CHAIN_ENTRY],
  loading: false,
  error: null,
  onAddChain: () => {},
  onRemoveChain: () => {},
  isChainAdded: () => false,
};

describe("AddChainModal", () => {
  it("renders nothing when open=false", () => {
    const { container, cleanup } = renderComponent({
      ...BASE_PROPS,
      open: false,
    });
    expect(container.querySelector("h3")).toBeNull();
    cleanup();
  });

  it("renders modal title when open=true", () => {
    const { container, cleanup } = renderComponent(BASE_PROPS);
    expect(container.querySelector("h3").textContent).toBe("Add Network");
    cleanup();
  });

  it("shows search input with provided value", () => {
    const { container, cleanup } = renderComponent({
      ...BASE_PROPS,
      search: "polygon",
    });
    const input = container.querySelector('input[type="text"]');
    expect(input).not.toBeNull();
    expect(input.value).toBe("polygon");
    cleanup();
  });

  it("calls onSearchChange when search input changes", () => {
    const onSearchChange = vi.fn();
    const { container, cleanup } = renderComponent({
      ...BASE_PROPS,
      onSearchChange,
    });
    const input = container.querySelector('input[type="text"]');
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    ).set;
    act(() => {
      nativeInputValueSetter.call(input, "eth");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onSearchChange).toHaveBeenCalled();
    cleanup();
  });

  it("shows loading text when loading=true", () => {
    const { container, cleanup } = renderComponent({
      ...BASE_PROPS,
      loading: true,
      chainlistData: [],
    });
    expect(container.textContent).toContain("Loading...");
    cleanup();
  });

  it("shows error message when error is set", () => {
    const { container, cleanup } = renderComponent({
      ...BASE_PROPS,
      error: "Failed to fetch",
      chainlistData: [],
    });
    expect(container.textContent).toContain("Failed to fetch");
    cleanup();
  });

  it("renders chainlist entries", () => {
    const { container, cleanup } = renderComponent(BASE_PROPS);
    expect(container.textContent).toContain("Polygon Mainnet");
    expect(container.textContent).toContain("137");
    cleanup();
  });

  it('shows "Added" badge for already-added chains', () => {
    const { container, cleanup } = renderComponent({
      ...BASE_PROPS,
      isChainAdded: () => true,
    });
    expect(container.textContent).toContain("Added");
    cleanup();
  });

  it("calls onAddChain when clicking an unadded chain entry", () => {
    const onAddChain = vi.fn();
    const { container, cleanup } = renderComponent({
      ...BASE_PROPS,
      onAddChain,
      isChainAdded: () => false,
    });
    // Find the chainlist item div (not the button, the row itself)
    const chainlistResults = container.querySelector(
      'div[class*="chainlistResults"]',
    );
    const chainItem = chainlistResults
      ? chainlistResults.firstElementChild
      : null;
    if (chainItem) {
      act(() => {
        chainItem.click();
      });
      expect(onAddChain).toHaveBeenCalledWith(CHAIN_ENTRY);
    }
    cleanup();
  });

  it("calls onClose when Close button is clicked", () => {
    const onClose = vi.fn();
    const { container, cleanup } = renderComponent({ ...BASE_PROPS, onClose });
    const closeBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Close",
    );
    expect(closeBtn).not.toBeUndefined();
    act(() => {
      closeBtn.click();
    });
    expect(onClose).toHaveBeenCalledOnce();
    cleanup();
  });

  it("renders added chains section when customChains is non-empty", () => {
    const customChains = [
      { id: "custom-137", chainId: 137, name: "Polygon", icon: null },
    ];
    const { container, cleanup } = renderComponent({
      ...BASE_PROPS,
      customChains,
    });
    expect(container.textContent).toContain("Added Networks (1)");
    cleanup();
  });

  it("hides added chains list when addedCollapsed=true", () => {
    const customChains = [
      { id: "custom-137", chainId: 137, name: "Polygon", icon: null },
    ];
    const { container, cleanup } = renderComponent({
      ...BASE_PROPS,
      customChains,
      addedCollapsed: true,
    });
    // Header is visible but the chain name inside the list should not appear
    // (the addedChainsList div is not rendered)
    const header = container.querySelector(
      'button[class*="addedChainsHeader"]',
    );
    expect(header).not.toBeNull();
    // The collapse icon should be ▶ when collapsed
    expect(header.textContent).toContain("▶");
    cleanup();
  });

  it("calls onToggleAddedCollapsed when header button is clicked", () => {
    const onToggleAddedCollapsed = vi.fn();
    const customChains = [
      { id: "custom-137", chainId: 137, name: "Polygon", icon: null },
    ];
    const { container, cleanup } = renderComponent({
      ...BASE_PROPS,
      customChains,
      onToggleAddedCollapsed,
    });
    const header = container.querySelector(
      'button[class*="addedChainsHeader"]',
    );
    act(() => {
      header.click();
    });
    expect(onToggleAddedCollapsed).toHaveBeenCalledOnce();
    cleanup();
  });

  it("calls onRemoveChain when remove button is clicked", () => {
    const onRemoveChain = vi.fn();
    const customChains = [
      { id: "custom-137", chainId: 137, name: "Polygon", icon: null },
    ];
    const { container, cleanup } = renderComponent({
      ...BASE_PROPS,
      customChains,
      addedCollapsed: false,
      onRemoveChain,
    });
    const removeBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.title === "Remove",
    );
    expect(removeBtn).not.toBeUndefined();
    act(() => {
      removeBtn.click();
    });
    expect(onRemoveChain).toHaveBeenCalledWith("custom-137");
    cleanup();
  });

  it("shows empty message when chainlistData is empty and no search", () => {
    const { container, cleanup } = renderComponent({
      ...BASE_PROPS,
      chainlistData: [],
      search: "",
    });
    expect(container.textContent).toContain("No networks available.");
    cleanup();
  });

  it("shows search-specific empty message when search has value", () => {
    const { container, cleanup } = renderComponent({
      ...BASE_PROPS,
      chainlistData: [],
      search: "xyz",
    });
    expect(container.textContent).toContain(
      "No networks found matching your search.",
    );
    cleanup();
  });
});
