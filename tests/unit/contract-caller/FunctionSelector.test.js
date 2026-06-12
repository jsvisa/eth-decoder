import { describe, it, expect, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import FunctionSelector from "../../../app/contract-caller/components/FunctionSelector.js";

// ---------------------------------------------------------------------------
// Minimal render helper (mirrors pattern used by FunctionEventsTabs.test.js)
// ---------------------------------------------------------------------------
function renderComponent(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(React.createElement(FunctionSelector, props));
  });
  return {
    container,
    cleanup() {
      document.body.removeChild(container);
    },
  };
}

// Sample ABI functions used across tests
const mockFunctions = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
];

describe("FunctionSelector", () => {
  it("renders a search input when no function is selected", () => {
    const { container, cleanup } = renderComponent({
      functions: mockFunctions,
      selectedFunction: "",
      onSelectFunction: () => {},
      disabled: false,
    });

    const input = container.querySelector("input");
    expect(input).not.toBeNull();
    expect(input.placeholder).toBe("Search or select a function...");

    cleanup();
  });

  it("renders the Function label", () => {
    const { container, cleanup } = renderComponent({
      functions: mockFunctions,
      selectedFunction: "",
      onSelectFunction: () => {},
      disabled: false,
    });

    expect(container.textContent).toContain("Function");

    cleanup();
  });

  it("disables the search input when disabled prop is true", () => {
    const { container, cleanup } = renderComponent({
      functions: mockFunctions,
      selectedFunction: "",
      onSelectFunction: () => {},
      disabled: true,
    });

    const input = container.querySelector("input");
    expect(input.disabled).toBe(true);

    cleanup();
  });

  it("shows function list when rendered with a pre-selected function (showList via toggle)", () => {
    // Render with a selected function so the "change function" dropdown button is visible.
    // Click the toggle button to open the list.
    const { container, cleanup } = renderComponent({
      functions: mockFunctions,
      selectedFunction: "transfer(address,uint256)",
      onSelectFunction: () => {},
      disabled: false,
    });

    // The ▼ button (changeFunctionBtnLeft) opens the list
    const toggleBtn = container.querySelector(
      "button[title='Change function']",
    );
    expect(toggleBtn).not.toBeNull();
    act(() => {
      toggleBtn.click();
    });

    // Both function names should now appear in the dropdown
    expect(container.textContent).toContain("transfer");
    expect(container.textContent).toContain("balanceOf");

    cleanup();
  });

  it("calls onSelectFunction when a function item is clicked after opening list", () => {
    const onSelectFunction = vi.fn();
    const { container, cleanup } = renderComponent({
      functions: mockFunctions,
      selectedFunction: "transfer(address,uint256)",
      onSelectFunction,
      disabled: false,
    });

    // Open the list via the toggle button
    const toggleBtn = container.querySelector(
      "button[title='Change function']",
    );
    act(() => {
      toggleBtn.click();
    });

    // The function items have class containing "functionItem" but not "functionItemSelected"
    // Use data from the rendered list: find items that are direct children of the list div
    const allFunctionItems = Array.from(
      container.querySelectorAll('[class*="functionItem"]'),
    ).filter((el) => !el.className.includes("Empty"));

    expect(allFunctionItems.length).toBeGreaterThan(0);

    act(() => {
      // Click the balanceOf item (second item)
      allFunctionItems[1].click();
    });

    expect(onSelectFunction).toHaveBeenCalledOnce();
    expect(onSelectFunction).toHaveBeenCalledWith("balanceOf(address)");

    cleanup();
  });

  it("displays read/write badge and selector when a function is selected", () => {
    const { container, cleanup } = renderComponent({
      functions: mockFunctions,
      selectedFunction: "balanceOf(address)",
      onSelectFunction: () => {},
      disabled: false,
    });

    // balanceOf is view → should show "read" badge
    expect(container.textContent).toContain("read");
    // Should NOT show "write" badge
    expect(container.textContent).not.toContain("write");
    // Should show 4-byte selector
    expect(container.textContent).toContain("0x");

    cleanup();
  });

  it("shows write badge for non-view functions", () => {
    const { container, cleanup } = renderComponent({
      functions: mockFunctions,
      selectedFunction: "transfer(address,uint256)",
      onSelectFunction: () => {},
      disabled: false,
    });

    expect(container.textContent).toContain("write");

    cleanup();
  });

  it("calls onSelectFunction with empty string when clear button is clicked", () => {
    const onSelectFunction = vi.fn();
    const { container, cleanup } = renderComponent({
      functions: mockFunctions,
      selectedFunction: "transfer(address,uint256)",
      onSelectFunction,
      disabled: false,
    });

    // The clear button is "×"
    const buttons = container.querySelectorAll("button");
    const clearBtn = Array.from(buttons).find((b) => b.textContent === "×");
    expect(clearBtn).not.toBeNull();

    act(() => {
      clearBtn.click();
    });

    expect(onSelectFunction).toHaveBeenCalledWith("");

    cleanup();
  });

  it("renders with an empty functions array without errors", () => {
    // Empty functions list should render the search input and no items
    const { container, cleanup } = renderComponent({
      functions: [],
      selectedFunction: "",
      onSelectFunction: () => {},
      disabled: false,
    });

    const input = container.querySelector("input");
    expect(input).not.toBeNull();
    expect(input.placeholder).toBe("Search or select a function...");

    cleanup();
  });
});
