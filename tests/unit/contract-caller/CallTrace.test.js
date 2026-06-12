import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import CallTrace from "../../../app/contract-caller/components/CallTrace.js";

// ---------------------------------------------------------------------------
// navigator.clipboard is not available in jsdom — stub it
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.stubGlobal("navigator", {
    ...navigator,
    clipboard: {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Minimal render helper
// ---------------------------------------------------------------------------
function renderComponent(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(React.createElement(CallTrace, props));
  });
  return {
    container,
    cleanup() {
      document.body.removeChild(container);
    },
  };
}

// ---------------------------------------------------------------------------
// Sample trace fixture
// ---------------------------------------------------------------------------
const simpleTrace = {
  type: "CALL",
  to: "0x1234567890abcdef1234567890abcdef12345678",
  toName: "MyContract",
  functionName: "transfer",
  input: "0xa9059cbb000000000000000000000000",
  gasUsed: 21000,
  decodedInputs: [
    { name: "to", value: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef" },
    { name: "amount", value: "1000000000000000000" },
  ],
  decodedOutputs: [{ name: "success", value: true }],
  calls: [],
  logs: [],
};

const traceWithError = {
  type: "CALL",
  to: "0xabcdef1234567890abcdef1234567890abcdef12",
  toName: "BadContract",
  functionName: "revert",
  input: "0x12345678",
  error: "revert",
  errorReason: "insufficient balance",
  calls: [],
  logs: [],
};

const traceWithChildren = {
  type: "CALL",
  to: "0x1111111111111111111111111111111111111111",
  toName: "Router",
  functionName: "swap",
  input: "0xabcdef01",
  gasUsed: 50000,
  decodedInputs: [],
  decodedOutputs: [],
  calls: [
    {
      type: "CALL",
      to: "0x2222222222222222222222222222222222222222",
      toName: "TokenA",
      functionName: "transferFrom",
      input: "0x23b872dd",
      gasUsed: 10000,
      decodedInputs: [],
      decodedOutputs: [],
      calls: [],
      logs: [],
    },
  ],
  logs: [{ name: "Swap", inputs: [{ name: "amount", value: "100" }] }],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CallTrace – basic render", () => {
  it("renders null when trace is null", () => {
    const { container, cleanup } = renderComponent({
      trace: null,
      tokenSymbols: {},
      chain: "ethereum",
    });
    expect(container.textContent).toBe("");
    cleanup();
  });

  it("renders the contract name and function name", () => {
    const { container, cleanup } = renderComponent({
      trace: simpleTrace,
      tokenSymbols: {},
      chain: "ethereum",
    });
    expect(container.textContent).toContain("MyContract");
    expect(container.textContent).toContain("transfer");
    cleanup();
  });

  it("renders the CALL type badge", () => {
    const { container, cleanup } = renderComponent({
      trace: simpleTrace,
      tokenSymbols: {},
      chain: "ethereum",
    });
    expect(container.textContent).toContain("CALL");
    cleanup();
  });

  it("renders gas used", () => {
    const { container, cleanup } = renderComponent({
      trace: simpleTrace,
      tokenSymbols: {},
      chain: "ethereum",
    });
    expect(container.textContent).toContain("21,000 gas");
    cleanup();
  });

  it("renders decoded input params", () => {
    const { container, cleanup } = renderComponent({
      trace: simpleTrace,
      tokenSymbols: {},
      chain: "ethereum",
    });
    expect(container.textContent).toContain("to=");
    expect(container.textContent).toContain("amount=");
    cleanup();
  });

  it("renders decoded output params with arrow", () => {
    const { container, cleanup } = renderComponent({
      trace: simpleTrace,
      tokenSymbols: {},
      chain: "ethereum",
    });
    expect(container.textContent).toContain("→");
    expect(container.textContent).toContain("success=");
    cleanup();
  });
});

describe("CallTrace – error state", () => {
  it("renders error message when trace has an error", () => {
    const { container, cleanup } = renderComponent({
      trace: traceWithError,
      tokenSymbols: {},
      chain: "ethereum",
    });
    expect(container.textContent).toContain("Error: insufficient balance");
    cleanup();
  });
});

describe("CallTrace – nested calls and logs", () => {
  it("renders child call", () => {
    const { container, cleanup } = renderComponent({
      trace: traceWithChildren,
      tokenSymbols: {},
      chain: "ethereum",
    });
    expect(container.textContent).toContain("TokenA");
    expect(container.textContent).toContain("transferFrom");
    cleanup();
  });

  it("renders event log emitted during the call", () => {
    const { container, cleanup } = renderComponent({
      trace: traceWithChildren,
      tokenSymbols: {},
      chain: "ethereum",
    });
    expect(container.textContent).toContain("Swap");
    cleanup();
  });
});

describe("CallTrace – STATICCALL filtering", () => {
  it("does not render STATICCALL nodes", () => {
    const staticTrace = {
      type: "STATICCALL",
      to: "0x3333333333333333333333333333333333333333",
      toName: "Oracle",
      functionName: "getPrice",
      input: "0xdeadbeef",
      calls: [],
      logs: [],
    };
    const { container, cleanup } = renderComponent({
      trace: staticTrace,
      tokenSymbols: {},
      chain: "ethereum",
    });
    expect(container.textContent).toBe("");
    cleanup();
  });
});

describe("CallTrace – copy interaction", () => {
  it("calls clipboard.writeText when Copy tooltip button is clicked", async () => {
    const { container, cleanup } = renderComponent({
      trace: simpleTrace,
      tokenSymbols: {},
      chain: "ethereum",
    });

    // Find all Copy buttons in tooltips
    const copyButtons = Array.from(container.querySelectorAll("button")).filter(
      (b) => b.textContent === "Copy",
    );

    expect(copyButtons.length).toBeGreaterThan(0);

    await act(async () => {
      copyButtons[0].click();
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalled();
    cleanup();
  });
});
