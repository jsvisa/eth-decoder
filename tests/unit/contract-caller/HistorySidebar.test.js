import { describe, it, expect, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import HistorySidebar from "../../../app/contract-caller/components/HistorySidebar.js";

function renderComponent(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(React.createElement(HistorySidebar, props));
  });
  return {
    container,
    cleanup() {
      document.body.removeChild(container);
    },
  };
}

const sampleHistory = [
  {
    id: "item-1",
    chain: "ethereum",
    type: "call",
    isWrite: false,
    functionName: "balanceOf",
    contractName: "MyToken",
    address: "0x1234567890123456789012345678901234567890",
    args: ["0xabcdef1234567890abcdef1234567890abcdef12"],
    output: { decoded: [{ value: "1000" }] },
    timestamp: new Date("2024-01-01T00:00:00Z").getTime(),
  },
  {
    id: "item-2",
    chain: "ethereum",
    type: "call",
    isWrite: true,
    functionName: "transfer",
    contractName: "MyToken",
    address: "0x1234567890123456789012345678901234567890",
    args: ["0xabcdef1234567890abcdef1234567890abcdef12", "500"],
    output: { decoded: [] },
    timestamp: new Date("2024-01-02T00:00:00Z").getTime(),
  },
  {
    id: "item-3",
    chain: "arbitrum",
    type: "call",
    isWrite: false,
    functionName: "totalSupply",
    contractName: "OtherToken",
    address: "0x9999999999999999999999999999999999999999",
    args: [],
    output: { decoded: [] },
    timestamp: new Date("2024-01-03T00:00:00Z").getTime(),
  },
];

const defaultProps = {
  history: sampleHistory,
  chain: "ethereum",
  show: true,
  onShowChange: vi.fn(),
  search: "",
  onSearchChange: vi.fn(),
  onLoad: vi.fn(),
  onClear: vi.fn(),
};

describe("HistorySidebar", () => {
  it("renders nothing when no history items match the current chain", () => {
    const { container, cleanup } = renderComponent({
      ...defaultProps,
      chain: "polygon",
    });
    expect(container.innerHTML).toBe("");
    cleanup();
  });

  it("renders the section with count for current chain only", () => {
    const { container, cleanup } = renderComponent(defaultProps);
    expect(container.textContent).toContain("Recent Calls (2)");
    // arbitrum item should not appear
    expect(container.textContent).not.toContain("OtherToken");
    cleanup();
  });

  it("renders history items when show is true", () => {
    const { container, cleanup } = renderComponent(defaultProps);
    expect(container.textContent).toContain("balanceOf");
    expect(container.textContent).toContain("transfer");
    cleanup();
  });

  it("hides list when show is false", () => {
    const { container, cleanup } = renderComponent({
      ...defaultProps,
      show: false,
    });
    // Header still visible
    expect(container.textContent).toContain("Recent Calls (2)");
    // But list items are not rendered
    expect(container.textContent).not.toContain("balanceOf");
    cleanup();
  });

  it("shows Hide button when show is true and Show when false", () => {
    const { container: c1, cleanup: cl1 } = renderComponent({
      ...defaultProps,
      show: true,
    });
    expect(c1.textContent).toContain("Hide");
    cl1();

    const { container: c2, cleanup: cl2 } = renderComponent({
      ...defaultProps,
      show: false,
    });
    expect(c2.textContent).toContain("Show");
    cl2();
  });

  it("calls onShowChange when toggle button is clicked", () => {
    const onShowChange = vi.fn();
    const { container, cleanup } = renderComponent({
      ...defaultProps,
      show: true,
      onShowChange,
    });

    const toggleBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Hide",
    );
    act(() => {
      toggleBtn.click();
    });

    expect(onShowChange).toHaveBeenCalledWith(false);
    cleanup();
  });

  it("calls onClear when Clear All button is clicked", () => {
    const onClear = vi.fn();
    const { container, cleanup } = renderComponent({
      ...defaultProps,
      onClear,
    });

    const clearBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Clear All",
    );
    act(() => {
      clearBtn.click();
    });

    expect(onClear).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("calls onLoad when a regular history item is clicked", () => {
    const onLoad = vi.fn();
    const { container, cleanup } = renderComponent({ ...defaultProps, onLoad });

    const items = container.querySelectorAll('[class*="historyItem"]');
    act(() => {
      items[0].click();
    });

    expect(onLoad).toHaveBeenCalledWith(sampleHistory[0]);
    cleanup();
  });

  it("filters items by search query", () => {
    const { container, cleanup } = renderComponent({
      ...defaultProps,
      search: "transfer",
    });

    expect(container.textContent).toContain("transfer");
    expect(container.textContent).not.toContain("balanceOf");
    cleanup();
  });

  it("renders read badge for read calls and write badge for write calls", () => {
    const { container, cleanup } = renderComponent(defaultProps);
    // Read badge "R" for balanceOf, write badge "W" for transfer
    const badges = container.querySelectorAll(
      '[class*="ReadBadge"], [class*="WriteBadge"]',
    );
    const texts = Array.from(badges).map((b) => b.textContent);
    expect(texts).toContain("R");
    expect(texts).toContain("W");
    cleanup();
  });

  it("renders session bundle item without click-to-load", () => {
    const sessionItem = {
      id: "session-1",
      chain: "ethereum",
      type: "session",
      block: 12345,
      txs: [
        {
          id: "tx-1",
          type: "read",
          success: true,
          contractName: "Token",
          functionName: "balanceOf",
          inputs: [{ value: "0xabc" }],
          outputs: [{ value: "1000" }],
        },
      ],
      timestamp: new Date("2024-01-01T00:00:00Z").getTime(),
    };

    const { container, cleanup } = renderComponent({
      ...defaultProps,
      history: [sessionItem],
    });

    expect(container.textContent).toContain("Session");
    expect(container.textContent).toContain("Block 12345");
    expect(container.textContent).toContain("1 tx");
    cleanup();
  });
});
