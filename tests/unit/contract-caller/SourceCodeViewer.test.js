import { describe, it, expect, vi, beforeEach } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import SourceCodeViewer from "../../../app/contract-caller/components/SourceCodeViewer.js";

function renderComponent(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(React.createElement(SourceCodeViewer, props));
  });
  return {
    container,
    cleanup() {
      document.body.removeChild(container);
    },
  };
}

const BASE_PROPS = {
  open: true,
  address: "0x1234567890abcdef1234567890abcdef12345678",
  chain: "ethereum",
  functionName: "transfer",
  onClose: () => {},
};

let mockHookValue = {};

vi.mock("../../../app/contract-caller/hooks/useSourceCode.js", () => ({
  useSourceCode: () => mockHookValue,
}));

vi.mock(
  "../../../app/contract-caller/components/SourceCodeViewer.module.css",
  () => ({
    default: new Proxy(
      {},
      { get: (_t, prop) => (typeof prop === "string" ? prop : undefined) },
    ),
  }),
);

beforeEach(() => {
  localStorage.clear();
  mockHookValue = {
    sources: {
      "Token.sol":
        "contract Token {\n  function transfer(address to, uint256 amount) external {}\n}",
    },
    compilerVersion: "0.8.19",
    loading: false,
    error: null,
  };
  // jsdom does not implement scrollIntoView
  Element.prototype.scrollIntoView = vi.fn();
});

describe("SourceCodeViewer", () => {
  it("renders nothing when open=false", () => {
    const { container, cleanup } = renderComponent({
      ...BASE_PROPS,
      open: false,
    });
    expect(container.innerHTML).toBe("");
    cleanup();
  });

  it("renders the modal overlay when open=true", () => {
    const { container, cleanup } = renderComponent(BASE_PROPS);
    expect(container.querySelectorAll("button").length).toBeGreaterThan(0);
    cleanup();
  });

  it("shows the compiler version badge", () => {
    const { container, cleanup } = renderComponent(BASE_PROPS);
    expect(container.textContent).toContain("solc 0.8.19");
    cleanup();
  });

  it("shows the contract address", () => {
    const { container, cleanup } = renderComponent(BASE_PROPS);
    expect(container.textContent).toContain("0x12345678...");
    cleanup();
  });

  it("shows the source code content", () => {
    const { container, cleanup } = renderComponent(BASE_PROPS);
    expect(container.textContent).toContain("contract Token");
    expect(container.textContent).toContain("function transfer");
    cleanup();
  });

  it("shows loading state", () => {
    mockHookValue = {
      sources: null,
      compilerVersion: null,
      loading: true,
      error: null,
    };
    const { container, cleanup } = renderComponent(BASE_PROPS);
    expect(container.textContent).toContain("Loading source code");
    cleanup();
  });

  it("shows error state", () => {
    mockHookValue = {
      sources: null,
      compilerVersion: null,
      loading: false,
      error: "No source code available",
    };
    const { container, cleanup } = renderComponent(BASE_PROPS);
    expect(container.textContent).toContain("No source code available");
    cleanup();
  });

  it("renders file tabs for multi-file contracts", () => {
    mockHookValue = {
      sources: {
        "Token.sol": "contract Token {}",
        "Lib.sol": "library Lib {}",
      },
      compilerVersion: "0.8.19",
      loading: false,
      error: null,
    };
    const { container, cleanup } = renderComponent(BASE_PROPS);
    expect(container.textContent).toContain("Token.sol");
    expect(container.textContent).toContain("Lib.sol");
    cleanup();
  });

  it("shows line numbers", () => {
    mockHookValue = {
      sources: { "Token.sol": "line1\nline2\nline3" },
      compilerVersion: null,
      loading: false,
      error: null,
    };
    const { container, cleanup } = renderComponent(BASE_PROPS);
    expect(container.textContent).toContain("1");
    expect(container.textContent).toContain("2");
    expect(container.textContent).toContain("3");
    cleanup();
  });

  it("highlights executed lines when highlightLines prop is provided", () => {
    mockHookValue = {
      sources: { "Token.sol": "line1\nline2\nline3\nline4\nline5" },
      compilerVersion: null,
      loading: false,
      error: null,
    };
    const { container, cleanup } = renderComponent({
      ...BASE_PROPS,
      highlightLines: [2, 3, 4],
    });
    expect(container.textContent).toContain("1");
    expect(container.textContent).toContain("2");
    expect(container.textContent).toContain("3");
    expect(container.textContent).toContain("4");
    expect(container.textContent).toContain("5");
    cleanup();
  });
});
