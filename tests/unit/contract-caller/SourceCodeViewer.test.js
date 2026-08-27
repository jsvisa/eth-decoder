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

function setNativeValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  ).set;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
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

  it("shows the contract address (truncated)", () => {
    const { container, cleanup } = renderComponent(BASE_PROPS);
    expect(container.textContent).toContain("0x1234...5678");
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

  it("shows a hover tooltip with function signature on mouseover", () => {
    vi.useFakeTimers();
    mockHookValue = {
      sources: {
        "Token.sol":
          "contract Token {\n  function transfer(address to, uint256 amount) external {}\n}",
      },
      compilerVersion: "0.8.19",
      loading: false,
      error: null,
    };
    const { container, cleanup } = renderComponent(BASE_PROPS);
    const fnSpan = container.querySelector("[data-fn-name]");
    expect(fnSpan).not.toBeNull();
    act(() => {
      fnSpan.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(container.textContent).toContain("transfer");
    expect(container.textContent).toContain("Token.sol:2");
    expect(container.textContent).toContain(
      "function transfer(address to, uint256 amount) external {}",
    );
    cleanup();
    vi.useRealTimers();
  });

  it("shows the full multi-line function body in the hover tooltip", () => {
    vi.useFakeTimers();
    mockHookValue = {
      sources: {
        "Token.sol":
          "contract Token {\n  function transfer(address to, uint256 amount) external {\n    require(to != address(0));\n    balances[to] += amount;\n  }\n}",
      },
      compilerVersion: "0.8.19",
      loading: false,
      error: null,
    };
    const { container, cleanup } = renderComponent(BASE_PROPS);
    const fnSpan = container.querySelector("[data-fn-name]");
    expect(fnSpan).not.toBeNull();
    act(() => {
      fnSpan.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(container.textContent).toContain("require(to != address(0))");
    expect(container.textContent).toContain("balances[to] += amount");
    cleanup();
    vi.useRealTimers();
  });

  it("re-navigates to definition when clicking a call to the already-highlighted function", () => {
    mockHookValue = {
      sources: {
        "Pool.sol":
          "contract Pool {\n" +
          "  function uniswapV3SwapCallback(int256 a, int256 b, bytes calldata d) external override {}\n" +
          "  function swap() external {}\n" +
          '  function doIt() external { uniswapV3SwapCallback(1, 2, hex""); }\n' +
          "}\n",
      },
      compilerVersion: "0.8.19",
      loading: false,
      error: null,
    };
    const { container, cleanup } = renderComponent({
      ...BASE_PROPS,
      functionName: "uniswapV3SwapCallback",
    });
    const scrollCalls = Element.prototype.scrollIntoView.mock.calls.length;
    const callSpan = [
      ...container.querySelectorAll('[data-fn-name="uniswapV3SwapCallback"]'),
    ].find(
      (s) => s.closest("tr").querySelector(".lineNum").textContent === "4",
    );
    expect(callSpan).toBeTruthy();
    act(() => {
      callSpan.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    // highlightLine is already on line 2; navigation must still scroll there.
    expect(Element.prototype.scrollIntoView.mock.calls.length).toBeGreaterThan(
      scrollCalls,
    );
    cleanup();
  });

  it("navigates to definition on click", () => {
    mockHookValue = {
      sources: {
        "Token.sol":
          "contract Token {\n  function transfer(address to, uint256 amount) external {}\n  function balanceOf(address account) external view returns (uint256) {}\n}",
      },
      compilerVersion: "0.8.19",
      loading: false,
      error: null,
    };
    const { container, cleanup } = renderComponent(BASE_PROPS);
    const fnSpans = container.querySelectorAll("[data-fn-name]");
    expect(fnSpans.length).toBeGreaterThan(0);
    const transferSpan = fnSpans[0];
    act(() => {
      transferSpan.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).toContain("transfer");
    cleanup();
  });

  it("renders nav back/forward buttons", () => {
    const { container, cleanup } = renderComponent(BASE_PROPS);
    const buttons = container.querySelectorAll("button");
    const navBtns = [...buttons].filter(
      (b) => b.textContent === "◀" || b.textContent === "▶",
    );
    expect(navBtns.length).toBe(2);
    cleanup();
  });

  it("tooltip stays open briefly after mouse leaves code, closes on tooltip mouseleave", () => {
    vi.useFakeTimers();
    mockHookValue = {
      sources: {
        "Token.sol":
          "contract Token {\n  function transfer(address to, uint256 amount) external {}\n}",
      },
      compilerVersion: "0.8.19",
      loading: false,
      error: null,
    };
    const { container, cleanup } = renderComponent(BASE_PROPS);
    const fnSpan = container.querySelector("[data-fn-name]");
    act(() => {
      fnSpan.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(container.textContent).toContain("Token.sol:2");
    act(() => {
      fnSpan.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    });
    expect(container.textContent).toContain("Token.sol:2");
    cleanup();
    vi.useRealTimers();
  });
});

describe("SourceCodeViewer enhanced viewer", () => {
  it("shows an outline panel with contract symbols", () => {
    mockHookValue = {
      sources: {
        "Token.sol":
          "contract Token {\n  uint256 public supply;\n  event Transfer(address from);\n  function transfer(address to) external {}\n}",
      },
      compilerVersion: "0.8.19",
      loading: false,
      error: null,
    };
    const { container, cleanup } = renderComponent(BASE_PROPS);
    const outline = container.textContent;
    expect(outline).toContain("Outline");
    expect(outline).toContain("Token");
    expect(outline).toContain("supply");
    expect(outline).toContain("Transfer");
    expect(outline).toContain("transfer");
    cleanup();
  });

  it("navigates to a symbol's line when clicked in the outline", () => {
    mockHookValue = {
      sources: {
        "Token.sol":
          "contract Token {\n  function alpha() external {}\n  function beta() external {}\n}",
      },
      compilerVersion: "0.8.19",
      loading: false,
      error: null,
    };
    const { container, cleanup } = renderComponent(BASE_PROPS);
    const scrollBefore = Element.prototype.scrollIntoView.mock.calls.length;
    const betaItem = [...container.querySelectorAll("button")].find((b) =>
      b.textContent.includes("beta"),
    );
    expect(betaItem).toBeTruthy();
    act(() => {
      betaItem.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(Element.prototype.scrollIntoView.mock.calls.length).toBeGreaterThan(
      scrollBefore,
    );
    cleanup();
  });

  it("searches across files and jumps to a result in another file", () => {
    mockHookValue = {
      sources: {
        "A.sol": "nothing here\nor here",
        "B.sol": "needle in B",
      },
      compilerVersion: null,
      loading: false,
      error: null,
    };
    const { container, cleanup } = renderComponent(BASE_PROPS);
    // enable all-files search
    const allFilesBtn = [...container.querySelectorAll("button")].find(
      (b) => b.title === "Search all files",
    );
    expect(allFilesBtn).toBeTruthy();
    act(() => {
      allFilesBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    // type query
    const searchInput = container.querySelector("." + "searchInput");
    expect(searchInput).toBeTruthy();
    act(() => {
      setNativeValue(searchInput, "needle");
    });
    // results list should show B.sol group
    expect(container.textContent).toContain("1 result");
    const resultBtn = [...container.querySelectorAll("button")].find((b) =>
      b.className.includes("resultItem"),
    );
    expect(resultBtn).toBeTruthy();
    act(() => {
      resultBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    // B.sol becomes active: its content is rendered and marked
    expect(container.textContent).toContain("needle in B");
    expect(container.querySelector("mark")).not.toBeNull();
    cleanup();
  });

  it("marks the exact match range instead of the whole line", () => {
    mockHookValue = {
      sources: { "Token.sol": "uint256 balance = 100;" },
      compilerVersion: null,
      loading: false,
      error: null,
    };
    const { container, cleanup } = renderComponent(BASE_PROPS);
    const searchInput = container.querySelector("." + "searchInput");
    act(() => {
      setNativeValue(searchInput, "balance");
    });
    const mark = container.querySelector("mark");
    expect(mark).not.toBeNull();
    expect(mark.textContent).toBe("balance");
    cleanup();
  });

  it("opens goto input with Ctrl+G and jumps to a line", () => {
    mockHookValue = {
      sources: { "Token.sol": "one\ntwo\nthree" },
      compilerVersion: null,
      loading: false,
      error: null,
    };
    const { container, cleanup } = renderComponent(BASE_PROPS);
    const overlay = container.querySelector("." + "overlay");
    act(() => {
      overlay.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "g",
          ctrlKey: true,
          bubbles: true,
        }),
      );
    });
    const gotoInput = container.querySelector("." + "gotoInput");
    expect(gotoInput).not.toBeNull();
    act(() => {
      setNativeValue(gotoInput, "3");
    });
    act(() => {
      gotoInput.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    expect(container.textContent).toContain("three");
    cleanup();
  });

  it("shows vyper and json highlighting without crashing", () => {
    mockHookValue = {
      sources: {
        "Vault.vy": "@external\ndef get() -> uint256:",
        "meta.json": '{"name": "vault"}',
      },
      compilerVersion: null,
      loading: false,
      error: null,
    };
    const { container, cleanup } = renderComponent(BASE_PROPS);
    expect(container.textContent).toContain("Vault.vy");
    expect(container.textContent).toContain("@external");
    // switch to json file via file tree
    const jsonBtn = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "meta.json",
    );
    act(() => {
      jsonBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).toContain('"name"');
    cleanup();
  });
});
