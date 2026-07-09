import { describe, it, expect } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import MetricsPanel from "../../../app/contract-caller/components/MetricsPanel.js";

// ---------------------------------------------------------------------------
// Minimal render helper
// ---------------------------------------------------------------------------
function renderComponent(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(React.createElement(MetricsPanel, props));
  });
  return {
    container,
    cleanup() {
      document.body.removeChild(container);
    },
  };
}

// ---------------------------------------------------------------------------
// Sample metrics fixture
// ---------------------------------------------------------------------------
const sample = {
  totalMs: 1240,
  phases: { prefetchMs: 540, executionMs: 700, lazyLoadMs: 290 },
  rpc: {
    totalLogicalCalls: 47,
    totalHttpCalls: 6,
    batchSize: 10,
    duplicates: 0,
    byMethod: {
      eth_getCode: { count: 12, totalMs: 180, maxMs: 38 },
      eth_getStorageAt: { count: 28, totalMs: 210, maxMs: 22 },
    },
  },
  touched: { addresses: 12, slots: 28 },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("<MetricsPanel>", () => {
  it("renders nothing when metrics is null", () => {
    const { container, cleanup } = renderComponent({ metrics: null });
    expect(container.firstChild).toBeNull();
    cleanup();
  });

  it("renders summary numbers when expanded", () => {
    const { container, cleanup } = renderComponent({ metrics: sample });
    const text = container.textContent;
    expect(text.includes("1240ms")).toBeTruthy();
    expect(text.includes("47 rpc calls")).toBeTruthy();
    expect(text.includes("eth_getCode")).toBeFalsy();
    cleanup();
  });

  it("renders the duplicates row only when duplicates > 0", () => {
    const metrics = {
      ...sample,
      rpc: { ...sample.rpc, duplicates: 3 },
    };
    const { container, cleanup } = renderComponent({ metrics });
    const header = container.querySelector("button");
    act(() => header.click());
    expect(/3 duplicate/i.test(container.textContent)).toBeTruthy();
    cleanup();
  });
});
