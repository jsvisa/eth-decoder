import { describe, it, expect, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import SessionHistoryStrip from "../../../app/contract-caller/components/SessionHistoryStrip.js";

function renderComponent(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(
      React.createElement(SessionHistoryStrip, props),
    );
  });
  return {
    container,
    cleanup() {
      document.body.removeChild(container);
    },
  };
}

const sampleItems = [
  {
    id: "item-1",
    type: "read",
    success: true,
    contractName: "Token",
    functionName: "balanceOf",
    inputs: [
      {
        name: "account",
        type: "address",
        value: "0xabc123def456abc123def456abc123def456abc1",
      },
    ],
    outputs: [{ name: "balance", type: "uint256", value: "1000" }],
  },
  {
    id: "item-2",
    type: "write",
    success: false,
    contractName: "Token",
    functionName: "transfer",
    inputs: [
      {
        name: "to",
        type: "address",
        value: "0x1234567890123456789012345678901234567890",
      },
      { name: "amount", type: "uint256", value: "500" },
    ],
    outputs: [],
  },
];

describe("SessionHistoryStrip", () => {
  it("renders nothing when active is false", () => {
    const { container, cleanup } = renderComponent({
      active: false,
      items: sampleItems,
      expandedIds: new Set(),
      onToggleExpanded: vi.fn(),
    });
    expect(container.innerHTML).toBe("");
    cleanup();
  });

  it("renders nothing when items is empty", () => {
    const { container, cleanup } = renderComponent({
      active: true,
      items: [],
      expandedIds: new Set(),
      onToggleExpanded: vi.fn(),
    });
    expect(container.innerHTML).toBe("");
    cleanup();
  });

  it("renders session history strip with items when active", () => {
    const { container, cleanup } = renderComponent({
      active: true,
      items: sampleItems,
      expandedIds: new Set(),
      onToggleExpanded: vi.fn(),
    });

    // Header shows tx count
    expect(container.textContent).toContain("Session History");
    expect(container.textContent).toContain("2 txs");

    // Both items rendered
    expect(container.textContent).toContain("#1");
    expect(container.textContent).toContain("#2");

    // Read badge
    expect(container.textContent).toContain("R");
    // Fail badge
    expect(container.textContent).toContain("✗");

    // Function names displayed
    expect(container.textContent).toContain("balanceOf");
    expect(container.textContent).toContain("transfer");

    cleanup();
  });

  it('shows singular "tx" for a single item', () => {
    const { container, cleanup } = renderComponent({
      active: true,
      items: [sampleItems[0]],
      expandedIds: new Set(),
      onToggleExpanded: vi.fn(),
    });
    expect(container.textContent).toContain("1 tx");
    expect(container.textContent).not.toContain("1 txs");
    cleanup();
  });

  it("shows collapsed chevron when item is not expanded", () => {
    const { container, cleanup } = renderComponent({
      active: true,
      items: sampleItems,
      expandedIds: new Set(),
      onToggleExpanded: vi.fn(),
    });
    expect(container.textContent).toContain("▼");
    expect(container.textContent).not.toContain("▲");
    cleanup();
  });

  it("shows expanded chevron and details when item is in expandedIds", () => {
    const { container, cleanup } = renderComponent({
      active: true,
      items: sampleItems,
      expandedIds: new Set(["item-1"]),
      onToggleExpanded: vi.fn(),
    });
    expect(container.textContent).toContain("▲");
    // Input section should be visible
    expect(container.textContent).toContain("in");
    // Output section should be visible
    expect(container.textContent).toContain("out");
    expect(container.textContent).toContain("balance");
    expect(container.textContent).toContain("1000");
    cleanup();
  });

  it('shows "void" for items with no outputs when expanded', () => {
    const { container, cleanup } = renderComponent({
      active: true,
      items: [sampleItems[1]],
      expandedIds: new Set(["item-2"]),
      onToggleExpanded: vi.fn(),
    });
    expect(container.textContent).toContain("void");
    cleanup();
  });

  it("calls onToggleExpanded with item id when header is clicked", () => {
    const onToggleExpanded = vi.fn();
    const { container, cleanup } = renderComponent({
      active: true,
      items: sampleItems,
      expandedIds: new Set(),
      onToggleExpanded,
    });

    const headers = container.querySelectorAll(
      '[class*="sessionHistoryItemHeader"]',
    );
    expect(headers.length).toBe(2);

    act(() => {
      headers[0].click();
    });

    expect(onToggleExpanded).toHaveBeenCalledTimes(1);
    expect(onToggleExpanded).toHaveBeenCalledWith("item-1");
    cleanup();
  });

  it("abbreviates long address inputs in function signature", () => {
    const { container, cleanup } = renderComponent({
      active: true,
      items: [sampleItems[0]],
      expandedIds: new Set(),
      onToggleExpanded: vi.fn(),
    });
    // Address 0xabc123... should be abbreviated to 0xabc1…abc1 form
    expect(container.textContent).toContain("0xabc1");
    expect(container.textContent).toContain("…");
    cleanup();
  });
});
