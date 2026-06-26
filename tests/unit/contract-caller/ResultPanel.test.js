import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import ResultPanel from "../../../app/contract-caller/components/ResultPanel.js";

// ---------------------------------------------------------------------------
// Minimal render helper
// ---------------------------------------------------------------------------
function renderComponent(ui) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(ui);
  });
  return {
    container,
    cleanup() {
      document.body.removeChild(container);
    },
  };
}

// Mock js-yaml
vi.mock("js-yaml", () => ({
  default: {
    dump: (obj) => JSON.stringify(obj),
  },
}));

// Mock CSS modules — identity proxy so className lookups resolve to strings
vi.mock(
  "../../../app/contract-caller/components/ResultPanel.module.css",
  () => ({
    default: new Proxy(
      {},
      { get: (_t, prop) => (typeof prop === "string" ? prop : undefined) },
    ),
  }),
);

// Mock chain utilities
vi.mock("../../../app/utils/chains", () => ({
  CHAINS: [
    {
      id: "ethereum",
      explorers: [{ url: "https://etherscan.io" }],
    },
  ],
}));

// Mock token utilities
vi.mock("../../../app/utils/tokenFormatting", () => ({
  formatTokenAmount: (value) => String(value),
}));

vi.mock("../../../app/utils/tokenTransfers", () => ({
  buildTokenAccountMap: () => ({}),
}));

// ---------------------------------------------------------------------------
// Shared mock props
// ---------------------------------------------------------------------------
const defaultProps = {
  result: null,
  error: null,
  chain: "ethereum",
  address: "0xContractAddress",
  fromAddress: "0xFromAddress",
  tokenSymbols: {},
  tokenDecimals: {},
  tokenPrices: {},
};

const readResult = {
  simulated: false,
  decoded: [{ name: "owner", type: "address", value: "0xDeadBeef" }],
};

const simResult = {
  simulated: true,
  success: true,
  logs: [
    {
      name: "Transfer",
      address: "0xTokenAddress",
      inputs: [
        {
          name: "from",
          type: "address",
          value: "0xFromAddress",
          indexed: true,
        },
        { name: "to", type: "address", value: "0xToAddress", indexed: true },
        {
          name: "value",
          type: "uint256",
          value: "1000000000000000000",
          indexed: false,
        },
      ],
    },
  ],
};

const multiLogResult = {
  simulated: true,
  success: true,
  logs: [
    {
      name: "Transfer",
      address: "0xTokenAddress",
      inputs: [{ name: "value", type: "uint256", value: "100" }],
    },
    {
      name: "Approval",
      address: "0xTokenAddress",
      inputs: [{ name: "spender", type: "address", value: "0xSpender" }],
    },
    {
      name: "Deposit",
      address: "0xVaultAddress",
      inputs: [{ name: "amount", type: "uint256", value: "50" }],
    },
  ],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ResultPanel", () => {
  it("renders nothing when result and error are both null", () => {
    const { container, cleanup } = renderComponent(
      React.createElement(ResultPanel, defaultProps),
    );
    expect(container.innerHTML).toBe("");
    cleanup();
  });

  it("renders an error message when error prop is provided", () => {
    const { container, cleanup } = renderComponent(
      React.createElement(ResultPanel, {
        ...defaultProps,
        error: "Something went wrong",
      }),
    );
    expect(container.textContent).toContain("Something went wrong");
    cleanup();
  });

  it("renders Result heading when result is provided", () => {
    const { container, cleanup } = renderComponent(
      React.createElement(ResultPanel, { ...defaultProps, result: readResult }),
    );
    expect(container.textContent).toContain("Result:");
    cleanup();
  });

  it("renders Decoded Output section for a read result", () => {
    const { container, cleanup } = renderComponent(
      React.createElement(ResultPanel, { ...defaultProps, result: readResult }),
    );
    expect(container.textContent).toContain("Decoded Output");
    expect(container.textContent).toContain("owner");
    expect(container.textContent).toContain("address");
    cleanup();
  });

  it("renders Simulated badge for a simulation result", () => {
    const { container, cleanup } = renderComponent(
      React.createElement(ResultPanel, { ...defaultProps, result: simResult }),
    );
    expect(container.textContent).toContain("Simulated");
    cleanup();
  });

  it("renders Event Logs section for a simulation result with logs", () => {
    const { container, cleanup } = renderComponent(
      React.createElement(ResultPanel, { ...defaultProps, result: simResult }),
    );
    expect(container.textContent).toContain("Event Logs");
    expect(container.textContent).toContain("Transfer");
    cleanup();
  });

  it("renders simulation event logs with emitted-order indexes", () => {
    const { container, cleanup } = renderComponent(
      React.createElement(ResultPanel, {
        ...defaultProps,
        result: multiLogResult,
      }),
    );

    expect(container.textContent).toContain("#0");
    expect(container.textContent).toContain("#1");
    expect(container.textContent).toContain("#2");

    cleanup();
  });

  it("hides every simulation event log when Event Logs is collapsed", () => {
    const { container, cleanup } = renderComponent(
      React.createElement(ResultPanel, {
        ...defaultProps,
        result: multiLogResult,
      }),
    );

    const eventLogsSection = container.querySelector(".logsSection");
    const collapseBtn = eventLogsSection.querySelector(".logsToggleBtn");
    act(() => {
      collapseBtn.click();
    });

    expect(eventLogsSection.textContent).toContain("Event Logs");
    expect(eventLogsSection.querySelectorAll(".logItem")).toHaveLength(0);

    cleanup();
  });

  it("filters simulation event logs by one selected event name", () => {
    const { container, cleanup } = renderComponent(
      React.createElement(ResultPanel, {
        ...defaultProps,
        result: multiLogResult,
      }),
    );

    const approvalFilter = container.querySelector(
      'input[aria-label="Show Approval event logs"]',
    );
    expect(approvalFilter).toBeTruthy();

    act(() => {
      approvalFilter.click();
    });

    const renderedLogs = Array.from(container.querySelectorAll(".logItem")).map(
      (node) => node.textContent,
    );
    expect(renderedLogs).toEqual([expect.stringContaining("Approval")]);
    expect(container.textContent).toContain("1 of 3");

    cleanup();
  });

  it("filters simulation event logs by multiple selected event names", () => {
    const { container, cleanup } = renderComponent(
      React.createElement(ResultPanel, {
        ...defaultProps,
        result: multiLogResult,
      }),
    );

    const transferFilter = container.querySelector(
      'input[aria-label="Show Transfer event logs"]',
    );
    const depositFilter = container.querySelector(
      'input[aria-label="Show Deposit event logs"]',
    );
    expect(transferFilter).toBeTruthy();
    expect(depositFilter).toBeTruthy();

    act(() => {
      transferFilter.click();
      depositFilter.click();
    });

    const renderedLogs = Array.from(container.querySelectorAll(".logItem")).map(
      (node) => node.textContent,
    );
    expect(renderedLogs).toEqual([
      expect.stringContaining("Transfer"),
      expect.stringContaining("Deposit"),
    ]);
    expect(container.textContent).toContain("2 of 3");

    cleanup();
  });

  it("shows all simulation event logs when All events is selected", () => {
    const { container, cleanup } = renderComponent(
      React.createElement(ResultPanel, {
        ...defaultProps,
        result: multiLogResult,
      }),
    );

    const approvalFilter = container.querySelector(
      'input[aria-label="Show Approval event logs"]',
    );
    const allEventsFilter = container.querySelector(
      'input[aria-label="Show all event logs"]',
    );
    expect(approvalFilter).toBeTruthy();
    expect(allEventsFilter).toBeTruthy();

    act(() => {
      approvalFilter.click();
    });
    expect(container.querySelectorAll(".logItem")).toHaveLength(1);

    act(() => {
      allEventsFilter.click();
    });

    const renderedLogs = Array.from(container.querySelectorAll(".logItem")).map(
      (node) => node.textContent,
    );
    expect(renderedLogs).toEqual([
      expect.stringContaining("Transfer"),
      expect.stringContaining("Approval"),
      expect.stringContaining("Deposit"),
    ]);
    expect(container.textContent).toContain("Event Logs (3)");

    cleanup();
  });

  it("renders a Failed badge when result.success is false", () => {
    const failedResult = { ...simResult, success: false };
    const { container, cleanup } = renderComponent(
      React.createElement(ResultPanel, {
        ...defaultProps,
        result: failedResult,
      }),
    );
    expect(container.textContent).toContain("Failed");
    cleanup();
  });

  it("renders call trace labels without duplicated function signatures", () => {
    const traceResult = {
      simulated: true,
      success: true,
      logs: [],
      callTrace: {
        type: "CALL",
        to: "0xf8b2c63711111111111111111111111111111111",
        toName: "0xf8b2c637....withdrawWei",
        functionName: "withdrawWei(uint256,uint256,uint256,uint256,uint8)",
        input: "0xabcdef01",
        decodedInputs: [{ name: "_isolationModeMarketId", value: "0" }],
        decodedOutputs: [],
        calls: [
          {
            type: "CALL",
            to: "0xf8b2c63722222222222222222222222222222222",
            toName: "0xf8b2c637....withdrawWei",
            functionName: "withdrawWei(uint256,uint256,uint256,uint256,uint8)",
            input: "0xabcdef02",
            decodedInputs: [{ name: "_isolationModeMarketId", value: "0" }],
            decodedOutputs: [],
            calls: [],
            logs: [],
          },
        ],
        logs: [],
      },
    };

    const { container, cleanup } = renderComponent(
      React.createElement(ResultPanel, {
        ...defaultProps,
        result: traceResult,
      }),
    );

    const contractLabels = Array.from(
      container.querySelectorAll(".traceContract"),
    ).map((node) => node.textContent);
    const functionLabels = Array.from(
      container.querySelectorAll(".traceFuncName"),
    ).map((node) => node.textContent);
    const tooltipContents = Array.from(
      container.querySelectorAll(".traceTooltipContent"),
    ).map((node) => node.textContent);
    const copyButtons = Array.from(container.querySelectorAll("button")).filter(
      (button) => button.textContent === "Copy",
    );

    expect(contractLabels[0]).toBe(
      "0xf8b2c637....withdrawWei(uint256,uint256,uint256,uint256,uint8)",
    );
    expect(contractLabels[1]).toBe("0xf8b2c637....withdrawWei");
    expect(functionLabels).toEqual([]);
    expect(tooltipContents).toEqual(
      expect.arrayContaining([
        "0xf8b2c63711111111111111111111111111111111",
        "0xabcdef01",
        "0xf8b2c63722222222222222222222222222222222",
        "0xabcdef02",
      ]),
    );
    expect(copyButtons).toHaveLength(4);

    cleanup();
  });

  it("collapses content when Collapse button is clicked", () => {
    const { container, cleanup } = renderComponent(
      React.createElement(ResultPanel, { ...defaultProps, result: readResult }),
    );

    // Initially decoded output is visible
    expect(container.textContent).toContain("Decoded Output");

    // Find and click the "Collapse" button
    const buttons = Array.from(container.querySelectorAll("button"));
    const collapseBtn = buttons.find((b) => b.textContent === "Collapse");
    expect(collapseBtn).toBeTruthy();

    act(() => {
      collapseBtn.click();
    });

    // After collapsing, decoded output is hidden
    expect(container.textContent).not.toContain("Decoded Output");

    cleanup();
  });
});

describe("ResultPanel – call trace name resolution", () => {
  const addr = "0xaabbccdd11111111111111111111111111111111";
  const abiKey = `abi-ethereum-${addr}`;

  function makeTraceResult(toName) {
    return {
      simulated: true,
      success: true,
      logs: [],
      callTrace: {
        type: "CALL",
        to: addr,
        toName,
        functionName: "transfer",
        input: "0xa9059cbb",
        decodedInputs: [],
        decodedOutputs: [],
        calls: [],
        logs: [],
      },
    };
  }

  function contractLabels(container) {
    return Array.from(container.querySelectorAll(".traceContract")).map(
      (n) => n.textContent,
    );
  }

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("shows contractName from ABI cache when toName is null", () => {
    localStorage.setItem(abiKey, JSON.stringify({ contractName: "USDC" }));

    const { container, cleanup } = renderComponent(
      React.createElement(ResultPanel, {
        ...defaultProps,
        result: makeTraceResult(null),
      }),
    );

    expect(contractLabels(container)[0]).toBe("USDC");
    cleanup();
  });

  it("prefers implContractName over contractName from ABI cache", () => {
    localStorage.setItem(
      abiKey,
      JSON.stringify({ contractName: "Proxy", implContractName: "UniswapV3Pool" }),
    );

    const { container, cleanup } = renderComponent(
      React.createElement(ResultPanel, {
        ...defaultProps,
        result: makeTraceResult(null),
      }),
    );

    expect(contractLabels(container)[0]).toBe("UniswapV3Pool");
    cleanup();
  });

  it("shows address book label when ABI cache is absent", () => {
    localStorage.setItem(
      "address_book",
      JSON.stringify([{ id: 1, label: "My USDC", address: addr, contractName: "" }]),
    );

    const { container, cleanup } = renderComponent(
      React.createElement(ResultPanel, {
        ...defaultProps,
        result: makeTraceResult(null),
      }),
    );

    expect(contractLabels(container)[0]).toBe("My USDC");
    cleanup();
  });

  it("falls back to address book contractName when label is empty", () => {
    localStorage.setItem(
      "address_book",
      JSON.stringify([
        { id: 1, label: "", address: addr, contractName: "ERC20Token" },
      ]),
    );

    const { container, cleanup } = renderComponent(
      React.createElement(ResultPanel, {
        ...defaultProps,
        result: makeTraceResult(null),
      }),
    );

    expect(contractLabels(container)[0]).toBe("ERC20Token");
    cleanup();
  });

  it("toName takes priority over ABI cache and address book", () => {
    localStorage.setItem(abiKey, JSON.stringify({ contractName: "USDC" }));
    localStorage.setItem(
      "address_book",
      JSON.stringify([{ id: 1, label: "My Token", address: addr, contractName: "" }]),
    );

    const { container, cleanup } = renderComponent(
      React.createElement(ResultPanel, {
        ...defaultProps,
        result: makeTraceResult("ExplicitName"),
      }),
    );

    expect(contractLabels(container)[0]).toBe("ExplicitName");
    cleanup();
  });

  it("ABI cache takes priority over address book", () => {
    localStorage.setItem(abiKey, JSON.stringify({ contractName: "USDC" }));
    localStorage.setItem(
      "address_book",
      JSON.stringify([{ id: 1, label: "My Token", address: addr, contractName: "" }]),
    );

    const { container, cleanup } = renderComponent(
      React.createElement(ResultPanel, {
        ...defaultProps,
        result: makeTraceResult(null),
      }),
    );

    expect(contractLabels(container)[0]).toBe("USDC");
    cleanup();
  });

  it("falls back to truncated address when no name source is available", () => {
    const { container, cleanup } = renderComponent(
      React.createElement(ResultPanel, {
        ...defaultProps,
        result: makeTraceResult(null),
      }),
    );

    expect(contractLabels(container)[0]).toBe("0xaabbccdd...");
    cleanup();
  });
});
