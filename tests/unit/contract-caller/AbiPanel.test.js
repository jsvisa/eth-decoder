import { describe, it, expect, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import AbiPanel from "../../../app/contract-caller/components/AbiPanel.js";

// ---------------------------------------------------------------------------
// Minimal render helper matching the pattern used in this test directory
// ---------------------------------------------------------------------------
function renderComponent(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(React.createElement(AbiPanel, props));
  });
  return {
    container,
    cleanup() {
      document.body.removeChild(container);
    },
  };
}

// Minimal parsed ABI for tests
const sampleAbi =
  '[{"type":"function","name":"transfer","stateMutability":"nonpayable","inputs":[{"name":"to","type":"address"},{"name":"amount","type":"uint256"}],"outputs":[{"name":"","type":"bool"}]}]';
const sampleParsedAbi = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
];

const defaultProps = {
  abi: sampleAbi,
  onAbiChange: vi.fn(),
  parsedAbi: sampleParsedAbi,
  abiSource: "etherscan",
  abiSaved: false,
  onSaveAbi: vi.fn(),
  onRefetchAbi: vi.fn(),
  loading: false,
};

describe("AbiPanel", () => {
  it("renders label and collapse button", () => {
    const { container, cleanup } = renderComponent(defaultProps);

    expect(container.textContent).toContain("ABI (JSON)");
    const buttons = container.querySelectorAll("button");
    const collapseBtn = Array.from(buttons).find((b) =>
      b.textContent.includes("Collapse"),
    );
    expect(collapseBtn).toBeTruthy();

    cleanup();
  });

  it("shows ABI source badge with refresh button", () => {
    const { container, cleanup } = renderComponent(defaultProps);

    expect(container.textContent).toContain("etherscan");
    const refreshBtn = container.querySelector(
      'button[title="Refresh ABI from explorer"]',
    );
    expect(refreshBtn).toBeTruthy();

    cleanup();
  });

  it("shows Save button when abi is provided", () => {
    const { container, cleanup } = renderComponent(defaultProps);

    const saveBtn = container.querySelector(
      'button[title="Save ABI to local cache"]',
    );
    expect(saveBtn).toBeTruthy();
    expect(saveBtn.textContent).toBe("Save");

    cleanup();
  });

  it("shows Saved feedback when abiSaved is true", () => {
    const { container, cleanup } = renderComponent({
      ...defaultProps,
      abiSaved: true,
    });

    const saveBtn = container.querySelector(
      'button[title="Save ABI to local cache"]',
    );
    expect(saveBtn.textContent).toBe("✓ Saved");

    cleanup();
  });

  it("renders List and Raw view toggle buttons", () => {
    const { container, cleanup } = renderComponent(defaultProps);

    const buttons = Array.from(container.querySelectorAll("button"));
    const listBtn = buttons.find((b) => b.textContent === "List");
    const rawBtn = buttons.find((b) => b.textContent === "Raw");
    expect(listBtn).toBeTruthy();
    expect(rawBtn).toBeTruthy();

    cleanup();
  });

  it("renders function and event entries in list view", () => {
    const { container, cleanup } = renderComponent(defaultProps);

    // Both functions should appear
    expect(container.textContent).toContain("transfer");
    expect(container.textContent).toContain("balanceOf");
    // Event group header (text-transform:uppercase is CSS-only; DOM text is 'Events')
    expect(container.textContent).toContain("Events");

    cleanup();
  });

  it("switches to raw view and shows textarea", () => {
    const { container, cleanup } = renderComponent(defaultProps);

    // Initially list view — no textarea visible
    let textarea = container.querySelector("textarea");
    expect(textarea).toBeNull();

    // Click Raw button
    const rawBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Raw",
    );
    act(() => {
      rawBtn.click();
    });

    textarea = container.querySelector("textarea");
    expect(textarea).toBeTruthy();
    expect(textarea.value).toBe(sampleAbi);

    cleanup();
  });

  it("calls onAbiChange when textarea changes", () => {
    const onAbiChange = vi.fn();
    const { container, cleanup } = renderComponent({
      ...defaultProps,
      parsedAbi: null, // forces raw view
      onAbiChange,
    });

    const textarea = container.querySelector("textarea");
    expect(textarea).toBeTruthy();

    // React listens to the native 'input' event for textarea onChange in jsdom.
    // We simulate it by using Object.getOwnPropertyDescriptor to set the value
    // then dispatching a synthetic event that React 19 picks up.
    act(() => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value",
      ).set;
      nativeInputValueSetter.call(
        textarea,
        '[{"type":"function","name":"foo","inputs":[],"outputs":[]}]',
      );
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(onAbiChange).toHaveBeenCalled();

    cleanup();
  });

  it("collapses content when collapse button is clicked", () => {
    const { container, cleanup } = renderComponent(defaultProps);

    // Content visible initially
    expect(container.querySelector('[class*="abiContent"]')).toBeTruthy();

    const collapseBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent.includes("Collapse"),
    );
    act(() => {
      collapseBtn.click();
    });

    // After collapse, content should be gone
    expect(container.querySelector('[class*="abiContent"]')).toBeNull();
    expect(container.textContent).toContain("Expand");

    cleanup();
  });

  it("shows empty state when search filter has no matches", () => {
    const { container, cleanup } = renderComponent(defaultProps);

    const searchInput = container.querySelector('input[type="text"]');
    expect(searchInput).toBeTruthy();

    act(() => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      ).set;
      nativeInputValueSetter.call(searchInput, "xyznonexistent");
      searchInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(container.textContent).toContain("No matching entries");

    cleanup();
  });

  it("disables Save and Refresh buttons when loading", () => {
    const { container, cleanup } = renderComponent({
      ...defaultProps,
      loading: true,
    });

    const saveBtn = container.querySelector(
      'button[title="Save ABI to local cache"]',
    );
    const refreshBtn = container.querySelector(
      'button[title="Refresh ABI from explorer"]',
    );
    expect(saveBtn.disabled).toBe(true);
    expect(refreshBtn.disabled).toBe(true);

    cleanup();
  });

  it("calls onSaveAbi when Save button is clicked", () => {
    const onSaveAbi = vi.fn();
    const { container, cleanup } = renderComponent({
      ...defaultProps,
      onSaveAbi,
    });

    const saveBtn = container.querySelector(
      'button[title="Save ABI to local cache"]',
    );
    act(() => {
      saveBtn.click();
    });

    expect(onSaveAbi).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it("calls onRefetchAbi when Refresh button is clicked", () => {
    const onRefetchAbi = vi.fn();
    const { container, cleanup } = renderComponent({
      ...defaultProps,
      onRefetchAbi,
    });

    const refreshBtn = container.querySelector(
      'button[title="Refresh ABI from explorer"]',
    );
    act(() => {
      refreshBtn.click();
    });

    expect(onRefetchAbi).toHaveBeenCalledTimes(1);

    cleanup();
  });
});
