import { describe, it, expect, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import EventsTab from "../../../app/contract-caller/components/EventsTab.js";

const SAMPLE_EVENTS = [
  {
    name: "Transfer",
    inputs: [
      { type: "address", indexed: true },
      { type: "address", indexed: true },
      { type: "uint256", indexed: false },
    ],
  },
  {
    name: "Approval",
    inputs: [
      { type: "address", indexed: true },
      { type: "address", indexed: true },
      { type: "uint256", indexed: false },
    ],
  },
];

const BASE_PROPS = {
  events: SAMPLE_EVENTS,
  selectedEvents: [],
  onToggleEvent: () => {},
  onSelectAll: () => {},
  onClearSelection: () => {},
  eventFilter: "",
  onEventFilterChange: () => {},
  eventListCollapsed: false,
  onToggleEventList: () => {},
  logsFromBlock: "",
  logsToBlock: "",
  onLogsFromBlockChange: () => {},
  onLogsToBlockChange: () => {},
  logsPage: 1,
  logsOffset: 100,
  onLogsPageChange: () => {},
  onLogsOffsetChange: () => {},
  onFetchLogs: () => {},
  fetchingLogs: false,
  logsError: null,
  logsFetched: false,
  eventLogs: [],
  logsFilter: "",
  onLogsFilterChange: () => {},
  onDownloadCsv: () => {},
  latestBlock: null,
};

function renderComponent(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(React.createElement(EventsTab, props));
  });
  return {
    container,
    cleanup() {
      document.body.removeChild(container);
    },
  };
}

describe("EventsTab", () => {
  it("renders event checkboxes for each event", () => {
    const { container, cleanup } = renderComponent(BASE_PROPS);

    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes).toHaveLength(SAMPLE_EVENTS.length);
    expect(container.textContent).toContain("Transfer");
    expect(container.textContent).toContain("Approval");

    cleanup();
  });

  it("shows the selected count in the section header", () => {
    const { container, cleanup } = renderComponent({
      ...BASE_PROPS,
      selectedEvents: ["Transfer"],
    });

    expect(container.textContent).toContain("1 of 2 selected");

    cleanup();
  });

  it("renders Select All and Clear buttons", () => {
    const { container, cleanup } = renderComponent(BASE_PROPS);

    const buttons = Array.from(container.querySelectorAll("button"));
    const texts = buttons.map((b) => b.textContent);
    expect(texts).toContain("Select All");
    expect(texts).toContain("Clear");

    cleanup();
  });

  it("calls onSelectAll when Select All is clicked", () => {
    const onSelectAll = vi.fn();
    const { container, cleanup } = renderComponent({
      ...BASE_PROPS,
      onSelectAll,
    });

    const selectAllBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Select All",
    );
    act(() => {
      selectAllBtn.click();
    });

    expect(onSelectAll).toHaveBeenCalledOnce();
    cleanup();
  });

  it("calls onClearSelection when Clear is clicked", () => {
    const onClearSelection = vi.fn();
    const { container, cleanup } = renderComponent({
      ...BASE_PROPS,
      onClearSelection,
    });

    const clearBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Clear",
    );
    act(() => {
      clearBtn.click();
    });

    expect(onClearSelection).toHaveBeenCalledOnce();
    cleanup();
  });

  it("calls onToggleEventList when the selection header is clicked", () => {
    const onToggleEventList = vi.fn();
    const { container, cleanup } = renderComponent({
      ...BASE_PROPS,
      onToggleEventList,
    });

    // The header div contains the toggle text
    const header = container.querySelector("[class*='eventSelectionHeader']");
    act(() => {
      header.click();
    });

    expect(onToggleEventList).toHaveBeenCalledOnce();
    cleanup();
  });

  it("collapses the event list when eventListCollapsed is true", () => {
    const { container, cleanup } = renderComponent({
      ...BASE_PROPS,
      eventListCollapsed: true,
    });

    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes).toHaveLength(0);
    // The collapsed indicator text is present (collapsed state)
    expect(container.textContent).not.toContain("Select All");

    cleanup();
  });

  it("filters events by eventFilter prop", () => {
    const { container, cleanup } = renderComponent({
      ...BASE_PROPS,
      eventFilter: "Transfer",
    });

    expect(container.textContent).toContain("Transfer");
    expect(container.textContent).not.toContain("Approval");

    cleanup();
  });

  it("shows empty message when no events match the filter", () => {
    const { container, cleanup } = renderComponent({
      ...BASE_PROPS,
      eventFilter: "NonExistent",
    });

    expect(container.textContent).toContain("No matching events");

    cleanup();
  });

  it("renders Fetch Logs button disabled when no events are selected", () => {
    const { container, cleanup } = renderComponent({
      ...BASE_PROPS,
      selectedEvents: [],
    });

    const fetchBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent.includes("Fetch Logs"),
    );
    expect(fetchBtn).toBeTruthy();
    expect(fetchBtn.disabled).toBe(true);

    cleanup();
  });

  it("renders Fetch Logs button enabled when events are selected", () => {
    const { container, cleanup } = renderComponent({
      ...BASE_PROPS,
      selectedEvents: ["Transfer"],
    });

    const fetchBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent.includes("Fetch Logs"),
    );
    expect(fetchBtn.disabled).toBe(false);
    expect(fetchBtn.textContent).toBe("Fetch Logs (1 selected)");

    cleanup();
  });

  it("shows fetching state on the button", () => {
    const { container, cleanup } = renderComponent({
      ...BASE_PROPS,
      fetchingLogs: true,
      selectedEvents: ["Transfer"],
    });

    const fetchBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Fetching...",
    );
    expect(fetchBtn).toBeTruthy();
    expect(fetchBtn.disabled).toBe(true);

    cleanup();
  });

  it("displays logsError when provided", () => {
    const { container, cleanup } = renderComponent({
      ...BASE_PROPS,
      logsError: "Something went wrong",
    });

    expect(container.textContent).toContain("Something went wrong");

    cleanup();
  });

  it("shows empty message when logsFetched is true and no logs", () => {
    const { container, cleanup } = renderComponent({
      ...BASE_PROPS,
      logsFetched: true,
      eventLogs: [],
    });

    expect(container.textContent).toContain("No logs found");

    cleanup();
  });

  it("renders log rows when eventLogs are provided", () => {
    const logs = [
      {
        blockNumber: "0xf4240",
        transactionHash: "0xabcdef1234567890abcdef1234",
        decodedName: "Transfer",
        decodedArgs: { from: "0x1", to: "0x2", value: "100" },
        timeStamp: null,
      },
    ];
    const { container, cleanup } = renderComponent({
      ...BASE_PROPS,
      eventLogs: logs,
    });

    expect(container.textContent).toContain("Transfer");
    expect(container.textContent).toContain("Found 1 logs");
    const link = container.querySelector("a");
    expect(link).toBeTruthy();
    expect(link.href).toContain("0xabcdef1234");

    cleanup();
  });

  it("calls onDownloadCsv when Download CSV is clicked", () => {
    const onDownloadCsv = vi.fn();
    const logs = [
      {
        blockNumber: "0x1",
        transactionHash: "0xaabbccdd1234567890aabbccdd",
        decodedName: "Transfer",
        decodedArgs: null,
        data: "0x00",
      },
    ];
    const { container, cleanup } = renderComponent({
      ...BASE_PROPS,
      eventLogs: logs,
      onDownloadCsv,
    });

    const csvBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Download CSV",
    );
    act(() => {
      csvBtn.click();
    });

    expect(onDownloadCsv).toHaveBeenCalledOnce();
    cleanup();
  });
});
