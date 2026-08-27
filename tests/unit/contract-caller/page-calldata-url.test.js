import { describe, it, expect, beforeEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

const settingsState = {
  rpcBatchSize: 1,
  apiKeys: {},
  rpcSettings: { ethereum: "" },
  getChainId: vi.fn(() => 1),
  customChains: [],
  setShowSettings: vi.fn(),
};

const ALLOWANCE = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
];

const abiHookState = {
  abi: "",
  setAbi: vi.fn(),
  parsedAbi: ALLOWANCE,
  functions: ALLOWANCE,
  fetchingAbi: false,
  abiSource: null,
  contractName: "Token",
  abiSaved: false,
  cachedAddresses: [],
  getCachedAddresses: vi.fn(() => []),
  setCachedAddressesState: vi.fn(),
  fetchAbi: vi.fn(),
  saveAbiToCache: vi.fn(),
};

const simulationOptionsState = {
  forkBlockNumber: "",
  // Behaves like a state setter so the rendered fork field reflects updates.
  setForkBlockNumber: vi.fn((value) => {
    simulationOptionsState.forkBlockNumber = value;
  }),
  fromAddress: "",
  setFromAddress: vi.fn(),
  cheatcodes: {},
  setCheatcodes: vi.fn(),
  balanceOverrides: [],
  setBalanceOverrides: vi.fn(),
  storageOverrides: [],
  setStorageOverrides: vi.fn(),
  ethValue: "",
  setEthValue: vi.fn(),
  ethValueUnit: "ETH",
  setEthValueUnit: vi.fn(),
  handleEthValueUnitChange: vi.fn(),
};

const tevmSessionState = {
  sessionActive: false,
  sessionStarting: false,
  tevmClientRef: { current: null },
  sessionBlock: null,
  appendToSessionHistory: vi.fn(),
  handleStartSession: vi.fn(),
  handleResetSession: vi.fn(),
  sessionHistory: [],
};

const callExecutionState = {
  result: null,
  setResult: vi.fn(),
  error: null,
  setError: vi.fn(),
  loading: false,
  setLoading: vi.fn(),
  simProgress: null,
  urlCopied: false,
  handleCall: vi.fn(),
  handleCancel: vi.fn(),
  handleShareUrl: vi.fn(),
  setSaveExtra: vi.fn(),
};

const eventLogsState = {
  activeTab: "functions",
  setActiveTab: vi.fn(),
  selectedEvents: [],
  toggleEventSelection: vi.fn(),
  selectAllEvents: vi.fn(),
  clearEventSelection: vi.fn(),
  eventFilter: "",
  setEventFilter: vi.fn(),
  eventListCollapsed: false,
  setEventListCollapsed: vi.fn(),
  logsFromBlock: "",
  setLogsFromBlock: vi.fn(),
  logsToBlock: "latest",
  setLogsToBlock: vi.fn(),
  logsPage: 1,
  setLogsPage: vi.fn(),
  logsOffset: 1000,
  setLogsOffset: vi.fn(),
  fetchLogs: vi.fn(),
  fetchingLogs: false,
  logsError: null,
  logsFetched: false,
  eventLogs: [],
  logsFilter: "",
  setLogsFilter: vi.fn(),
  downloadLogsAsCsv: vi.fn(),
  latestBlockCache: null,
};

const bookmarkState = {
  addressBook: [],
  openBookmarkModal: vi.fn(),
  showBookmarkModal: false,
  bookmarkAddress: "",
  bookmarkLabel: "",
  bookmarkNotes: "",
  setBookmarkLabel: vi.fn(),
  setBookmarkNotes: vi.fn(),
  saveBookmark: vi.fn(),
  removeBookmark: vi.fn(),
  closeBookmarkModal: vi.fn(),
};

const addChainState = {
  openAddChainModal: vi.fn(),
  showAddChainModal: false,
  closeAddChainModal: vi.fn(),
  chainlistSearch: "",
  setChainlistSearch: vi.fn(),
  customChains: [],
  addedChainsCollapsed: false,
  setAddedChainsCollapsed: vi.fn(),
  visibleChains: [],
  chainlistLoading: false,
  chainlistError: null,
  addCustomChain: vi.fn(),
  removeCustomChain: vi.fn(),
  isChainAdded: vi.fn(() => false),
  showTestnets: false,
  setShowTestnets: vi.fn(),
};

const tokenMetadataState = {
  tokenSymbols: {},
  tokenDecimals: {},
  tokenPrices: {},
  fetchTokenSymbolsForLogs: vi.fn(),
  fetchTokenDataForSimulation: vi.fn(),
  setTokenSymbols: vi.fn(),
  setTokenDecimals: vi.fn(),
  setTokenPrices: vi.fn(),
};

vi.mock("../../../app/contexts/SettingsContext.js", () => ({
  useSettings: () => settingsState,
}));

vi.mock("../../../app/contract-caller/hooks/useAbi.js", () => ({
  useAbi: () => abiHookState,
}));

// NOTE: useFunctionSelection + useHistory are intentionally NOT mocked — real hooks.
vi.mock("../../../app/contract-caller/hooks/useSimulationOptions.js", () => ({
  useSimulationOptions: () => simulationOptionsState,
}));

vi.mock("../../../app/contract-caller/hooks/useTevmSession.js", () => ({
  useTevmSession: () => tevmSessionState,
}));

vi.mock("../../../app/contract-caller/hooks/useCallExecution.js", () => ({
  useCallExecution: () => callExecutionState,
}));

vi.mock("../../../app/contract-caller/hooks/useEventLogs.js", () => ({
  useEventLogs: () => eventLogsState,
}));

vi.mock("../../../app/contract-caller/hooks/useBookmarkModal.js", () => ({
  useBookmarkModal: () => bookmarkState,
}));

vi.mock("../../../app/contract-caller/hooks/useAddChainModal.js", () => ({
  useAddChainModal: () => addChainState,
}));

vi.mock("../../../app/contract-caller/hooks/useTokenMetadata.js", () => ({
  useTokenMetadata: () => tokenMetadataState,
}));

vi.mock("../../../app/contract-caller/components/NetworkSelector.js", () => ({
  default: () => React.createElement("div", { "data-testid": "net" }),
}));
vi.mock(
  "../../../app/contract-caller/components/ContractAddressInput.js",
  () => ({
    default: (props) =>
      React.createElement("input", {
        "data-testid": "address-input",
        value: props.address,
        onChange: (e) => props.onAddressChange(e.target.value),
      }),
  }),
);
vi.mock("../../../app/contract-caller/components/AbiPanel.js", () => ({
  default: () => React.createElement("div"),
}));
vi.mock(
  "../../../app/contract-caller/components/FunctionEventsTabs.js",
  () => ({
    default: ({ functionsContent }) =>
      React.createElement("div", null, functionsContent),
  }),
);
vi.mock("../../../app/contract-caller/components/FunctionSelector.js", () => ({
  default: (props) =>
    React.createElement(
      "select",
      {
        "data-testid": "fn-select",
        value: props.selectedFunction,
        onChange: (e) => props.onSelectFunction(e.target.value),
      },
      props.functions.map((f) =>
        React.createElement(
          "option",
          {
            key: f.name,
            value: `${f.name}(${f.inputs.map((i) => i.type).join(",")})`,
          },
          f.name,
        ),
      ),
    ),
}));
vi.mock("../../../app/contract-caller/components/CalldataSection.js", () => ({
  default: (props) =>
    React.createElement("textarea", {
      "data-testid": "calldata",
      readOnly: true,
      value: props.value,
    }),
}));
vi.mock("../../../app/contract-caller/components/SimulationOptions.js", () => ({
  default: (props) =>
    React.createElement("input", {
      "data-testid": "fork-block",
      value: props.forkBlockNumber ?? "",
      onChange: (e) => props.onForkBlockChange(e.target.value),
    }),
}));
vi.mock("../../../app/contract-caller/components/ArgsInput.js", () => ({
  default: (props) =>
    React.createElement(
      "div",
      null,
      (props.fn?.inputs || []).map((input, i) =>
        React.createElement("input", {
          key: i,
          "data-testid": `arg-${i}`,
          value: props.args[i] ?? "",
          onChange: (e) => {
            const next = [...props.args];
            next[i] = e.target.value;
            props.onArgsChange(next);
          },
        }),
      ),
    ),
}));
vi.mock("../../../app/contract-caller/components/EventsTab.js", () => ({
  default: () => React.createElement("div"),
}));
vi.mock("../../../app/contract-caller/components/CallActionBar.js", () => ({
  default: () => React.createElement("div"),
}));
vi.mock("../../../app/contract-caller/components/ResultPanel.js", () => ({
  default: () => React.createElement("div"),
}));
vi.mock(
  "../../../app/contract-caller/components/SessionHistoryStrip.js",
  () => ({
    default: () => React.createElement("div"),
  }),
);
vi.mock("../../../app/contract-caller/components/HistorySidebar.js", () => ({
  default: () => React.createElement("div"),
}));
vi.mock("../../../app/contract-caller/components/BookmarkModal.js", () => ({
  default: () => React.createElement("div"),
}));
vi.mock("../../../app/contract-caller/components/AddChainModal.js", () => ({
  default: () => React.createElement("div"),
}));

import ContractCallerPage from "../../../app/contract-caller/page.js";

function renderPage() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root;
  act(() => {
    root = createRoot(container);
    root.render(React.createElement(ContractCallerPage));
  });
  const q = (testid) => container.querySelector(`[data-testid="${testid}"]`);
  return {
    q,
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("ContractCallerPage – calldata URL sync (real useFunctionSelection)", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    localStorage.clear();
  });

  it("backfills calldata into the URL when args change", () => {
    const page = renderPage();

    const setInput = (el, value) => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      ).set;
      setter.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };

    // Set address via the mocked input
    act(() => {
      setInput(
        page.q("address-input"),
        "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      );
    });

    // Select allowance(address,address)
    const select = page.q("fn-select");
    act(() => {
      select.value = "allowance(address,address)";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const calldataArea = () => page.q("calldata");
    // Calldata backfills immediately (zero placeholders for empty args)
    expect(calldataArea().value).toMatch(/^0xdd62ed3e/);
    expect(window.location.search).toContain("calldata=0xdd62ed3e");

    act(() => {
      setInput(page.q("arg-0"), "0xfC44011b887a8824A708D7271e15c9Ac79bb1132");
    });
    // Partial args re-encode live (arg1 real, arg2 still zero)
    expect(calldataArea().value).toContain(
      "fc44011b887a8824a708d7271e15c9ac79bb1132",
    );

    act(() => {
      setInput(page.q("arg-1"), "0x888888888889758F76e7103c6CbF23ABbF58F946");
    });

    expect(window.location.search).toContain(
      "calldata=0xdd62ed3e000000000000000000000000fc44011b887a8824a708d7271e15c9ac79bb1132000000000000000000000000888888888889758f76e7103c6cbf23abbf58f946",
    );
    expect(calldataArea().value).toBe(
      "0xdd62ed3e000000000000000000000000fc44011b887a8824a708d7271e15c9ac79bb1132000000000000000000000000888888888889758f76e7103c6cbf23abbf58f946",
    );
    page.unmount();
  });

  it("re-encodes calldata in the URL after editing args on a hydrated link", () => {
    window.history.replaceState(
      null,
      "",
      "/?chain=ethereum&address=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48&calldata=0xdd62ed3e000000000000000000000000fc44011b887a8824a708d7271e15c9ac79bb1132000000000000000000000000888888888889758f76e7103c6cbf23abbf58f946",
    );
    const page = renderPage();

    const setInput = (el, value) => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      ).set;
      setter.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };

    // Hydration decoded the calldata into the args inputs
    expect(page.q("arg-0")?.value).toBe(
      "0xfC44011b887a8824A708D7271e15c9Ac79bb1132",
    );

    act(() => {
      setInput(page.q("arg-0"), "0x0000000000000000000000000000000000000001");
    });

    expect(window.location.search).toContain(
      "calldata=0xdd62ed3e0000000000000000000000000000000000000000000000000000000000000001",
    );
    page.unmount();
  });

  it("syncs the simulation fork block into the shared block URL param", () => {
    simulationOptionsState.forkBlockNumber = "19000000";
    const page = renderPage();

    const setInput = (el, value) => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      ).set;
      setter.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };

    act(() => {
      setInput(
        page.q("address-input"),
        "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      );
    });

    expect(page.q("fork-block").value).toBe("19000000");
    expect(window.location.search).toContain("block=19000000");
    expect(window.location.search).not.toContain("fork=");

    page.unmount();
    simulationOptionsState.forkBlockNumber = "";
  });

  it("hydrates the simulation fork field with the block URL param", () => {
    window.history.replaceState(
      null,
      "",
      "/?chain=ethereum&address=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48&block=19000000",
    );
    const page = renderPage();

    expect(page.q("fork-block").value).toBe("19000000");

    page.unmount();
    simulationOptionsState.forkBlockNumber = "";
  });
});
