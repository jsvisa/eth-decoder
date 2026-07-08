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

const abiHookState = {
  abi: "",
  setAbi: vi.fn(),
  parsedAbi: [],
  functions: [],
  fetchingAbi: false,
  detectProxy: false,
  setDetectProxy: vi.fn(),
  abiSource: null,
  contractName: null,
  abiSaved: false,
  cachedAddresses: [],
  getCachedAddresses: vi.fn(() => []),
  setCachedAddressesState: vi.fn(),
  fetchAbi: vi.fn(),
  saveAbiToCache: vi.fn(),
};

const functionSelectionState = {
  selectedFunction: "",
  setSelectedFunction: vi.fn(),
  args: [],
  setArgs: vi.fn(),
  fieldErrors: {},
  setFieldErrors: vi.fn(),
  pasteCalldataExpanded: false,
  setPasteCalldataExpanded: vi.fn(),
  pasteCalldataValue: "",
  setPasteCalldataValue: vi.fn(),
  pasteCalldataError: null,
  setPasteCalldataError: vi.fn(),
  ethValue: "",
  setEthValue: vi.fn(),
  ethValueUnit: "ETH",
  setEthValueUnit: vi.fn(),
  readBlockNumber: "",
  setReadBlockNumber: vi.fn(),
  calldataCopied: false,
  handleDecodeAndFill: vi.fn(),
  handleCopyCalldata: vi.fn(),
  applyPendingArgs: vi.fn(),
};

const simulationOptionsState = {
  forkBlockNumber: "",
  setForkBlockNumber: vi.fn(),
  fromAddress: "",
  setFromAddress: vi.fn(),
  cheatcodes: {},
  setCheatcodes: vi.fn(),
  balanceOverrides: [],
  setBalanceOverrides: vi.fn(),
  storageOverrides: [],
  setStorageOverrides: vi.fn(),
  timestampOverride: "",
  setTimestampOverride: vi.fn(),
  simOptionsExpanded: false,
  setSimOptionsExpanded: vi.fn(),
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

const historyState = {
  history: [],
  showHistory: true,
  setShowHistory: vi.fn(),
  historySearch: "",
  setHistorySearch: vi.fn(),
  expandedHistoryIds: new Set(),
  toggleHistoryExpanded: vi.fn(),
  saveToHistory: vi.fn(),
  saveSessionBundle: vi.fn(),
  loadFromHistory: vi.fn(),
  clearHistory: vi.fn(),
  pendingHistoryRef: { current: null },
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
  addedChainsCollapsed: false,
  setAddedChainsCollapsed: vi.fn(),
  chainlistData: [],
  chainlistLoading: false,
  chainlistError: null,
  addCustomChain: vi.fn(),
  removeCustomChain: vi.fn(),
  isChainAdded: vi.fn(() => false),
};

const tokenMetadataState = {
  tokenSymbols: {},
  tokenDecimals: {},
  tokenPrices: {},
  setTokenSymbols: vi.fn(),
  setTokenDecimals: vi.fn(),
  setTokenPrices: vi.fn(),
  fetchTokenSymbolsForLogs: vi.fn(),
  fetchTokenDataForSimulation: vi.fn(),
};

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const NATIVE_TOKEN_ADDRESS = "0x0000000000000000000000000000000000000000";
const TOKEN_ADDRESS = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const FROM_ADDRESS = "0xb826224b742ead5cf91ea432340e3763fac09cdd";
const TO_ADDRESS = "0xdeadbeef00000000000000000000000000000001";

const padAddress = (address) => `0x${address.slice(2).padStart(64, "0")}`;
const encodeUint256 = (value) =>
  `0x${BigInt(value).toString(16).padStart(64, "0")}`;

let abiHookArgs;
let callExecutionArgs;
let historyHookArgs;
let eventLogsArgs;

vi.mock("../../../app/contexts/SettingsContext.js", () => ({
  useSettings: () => settingsState,
}));

vi.mock("../../../app/contract-caller/hooks/useAbi.js", () => ({
  useAbi: (args) => {
    abiHookArgs = args;
    return abiHookState;
  },
}));

vi.mock("../../../app/contract-caller/hooks/useFunctionSelection.js", () => ({
  useFunctionSelection: () => functionSelectionState,
}));

vi.mock("../../../app/contract-caller/hooks/useSimulationOptions.js", () => ({
  useSimulationOptions: () => simulationOptionsState,
}));

vi.mock("../../../app/contract-caller/hooks/useTevmSession.js", () => ({
  useTevmSession: () => tevmSessionState,
}));

vi.mock("../../../app/contract-caller/hooks/useCallExecution.js", () => ({
  useCallExecution: (args) => {
    callExecutionArgs = args;
    return callExecutionState;
  },
}));

vi.mock("../../../app/contract-caller/hooks/useHistory.js", () => ({
  useHistory: (args) => {
    historyHookArgs = args;
    return historyState;
  },
}));

vi.mock("../../../app/contract-caller/hooks/useEventLogs.js", () => ({
  useEventLogs: (args) => {
    eventLogsArgs = args;
    return eventLogsState;
  },
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
  default: () =>
    React.createElement("div", { "data-testid": "network-selector" }),
}));
vi.mock(
  "../../../app/contract-caller/components/ContractAddressInput.js",
  () => ({
    default: () =>
      React.createElement("div", { "data-testid": "contract-address-input" }),
  }),
);
vi.mock("../../../app/contract-caller/components/AbiPanel.js", () => ({
  default: () => React.createElement("div", { "data-testid": "abi-panel" }),
}));
vi.mock(
  "../../../app/contract-caller/components/FunctionEventsTabs.js",
  () => ({
    default: () =>
      React.createElement("div", { "data-testid": "function-events-tabs" }),
  }),
);
vi.mock("../../../app/contract-caller/components/FunctionSelector.js", () => ({
  default: () =>
    React.createElement("div", { "data-testid": "function-selector" }),
}));
vi.mock("../../../app/contract-caller/components/CalldataSection.js", () => ({
  default: () =>
    React.createElement("div", { "data-testid": "calldata-section" }),
}));
vi.mock("../../../app/contract-caller/components/SimulationOptions.js", () => ({
  default: () =>
    React.createElement("div", { "data-testid": "simulation-options" }),
}));
vi.mock("../../../app/contract-caller/components/ArgsInput.js", () => ({
  default: () => React.createElement("div", { "data-testid": "args-input" }),
}));
vi.mock("../../../app/contract-caller/components/EventsTab.js", () => ({
  default: () => React.createElement("div", { "data-testid": "events-tab" }),
}));
vi.mock("../../../app/contract-caller/components/CallActionBar.js", () => ({
  default: () =>
    React.createElement("div", { "data-testid": "call-action-bar" }),
}));
vi.mock("../../../app/contract-caller/components/ResultPanel.js", () => ({
  default: () => React.createElement("div", { "data-testid": "result-panel" }),
}));
vi.mock(
  "../../../app/contract-caller/components/SessionHistoryStrip.js",
  () => ({
    default: () =>
      React.createElement("div", { "data-testid": "session-history-strip" }),
  }),
);
vi.mock("../../../app/contract-caller/components/HistorySidebar.js", () => ({
  default: () =>
    React.createElement("div", { "data-testid": "history-sidebar" }),
}));
vi.mock("../../../app/contract-caller/components/BookmarkModal.js", () => ({
  default: () =>
    React.createElement("div", { "data-testid": "bookmark-modal" }),
}));
vi.mock("../../../app/contract-caller/components/AddChainModal.js", () => ({
  default: () =>
    React.createElement("div", { "data-testid": "add-chain-modal" }),
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
  return {
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("ContractCallerPage wiring", () => {
  beforeEach(() => {
    abiHookArgs = undefined;
    callExecutionArgs = undefined;
    historyHookArgs = undefined;
    eventLogsArgs = undefined;
    callExecutionState.result = null;
    tokenMetadataState.tokenSymbols = {};
    tokenMetadataState.tokenDecimals = {};
    tokenMetadataState.tokenPrices = {};
    settingsState.setShowSettings.mockReset();
    settingsState.getChainId.mockClear();
    callExecutionState.setResult.mockReset();
    callExecutionState.setError.mockReset();
    callExecutionState.setLoading.mockReset();
    functionSelectionState.setSelectedFunction.mockReset();
    functionSelectionState.setArgs.mockReset();
    functionSelectionState.setPasteCalldataValue.mockReset();
    functionSelectionState.setPasteCalldataError.mockReset();
    functionSelectionState.setEthValue.mockReset();
    functionSelectionState.applyPendingArgs.mockReset();
    simulationOptionsState.setFromAddress.mockReset();
    tokenMetadataState.fetchTokenSymbolsForLogs.mockReset();
    tokenMetadataState.fetchTokenDataForSimulation.mockReset();
    callExecutionState.setSaveExtra.mockReset();
    abiHookState.getCachedAddresses.mockClear();
    abiHookState.setCachedAddressesState.mockClear();
    vi.unstubAllGlobals();
    window.history.pushState(null, "", "/");
  });

  it("passes live integration callbacks instead of stubs", () => {
    const { unmount } = renderPage();

    expect(callExecutionArgs.setCachedAddresses).toBe(
      abiHookState.setCachedAddressesState,
    );
    expect(callExecutionArgs.getCachedAddresses).toBe(
      abiHookState.getCachedAddresses,
    );
    expect(historyHookArgs.applyPendingArgs).toBe(
      functionSelectionState.applyPendingArgs,
    );

    const errors = {};
    const argErrors = [];
    expect(
      callExecutionArgs.validateAddressesInArg(
        "not-an-address",
        { type: "address", name: "recipient" },
        errors,
        0,
        argErrors,
      ),
    ).toBe(false);
    expect(errors.arg_0).toBe(true);
    expect(argErrors).toEqual(["recipient must be a valid Ethereum address"]);

    eventLogsArgs.onMissingApiKey();
    expect(settingsState.setShowSettings).toHaveBeenCalledWith(true);

    unmount();
  });

  it("routes ABI parse and error callbacks back into page state", () => {
    const { unmount } = renderPage();

    abiHookArgs.onAbiParsed(null, []);
    expect(functionSelectionState.setSelectedFunction).toHaveBeenCalledWith("");
    expect(functionSelectionState.setArgs).toHaveBeenCalledWith([]);
    expect(functionSelectionState.setPasteCalldataValue).toHaveBeenCalledWith(
      "",
    );
    expect(functionSelectionState.setPasteCalldataError).toHaveBeenCalledWith(
      null,
    );
    expect(callExecutionState.setError).toHaveBeenCalledWith(null);

    abiHookArgs.onAbiError("Invalid ABI JSON format");
    expect(callExecutionState.setError).toHaveBeenLastCalledWith(
      "Invalid ABI JSON format",
    );

    abiHookArgs.onSetError("Fetch failed");
    expect(callExecutionState.setError).toHaveBeenLastCalledWith(
      "Fetch failed",
    );

    unmount();
  });

  it("loads a shared simulation result from the simulationId URL param", async () => {
    const sharedResult = {
      success: true,
      simulated: true,
      _tokenMeta: {
        tokenSymbols: { [TOKEN_ADDRESS]: "USDC" },
        tokenDecimals: { [TOKEN_ADDRESS]: 6 },
        tokenPrices: {
          [NATIVE_TOKEN_ADDRESS]: 2500,
          [TOKEN_ADDRESS]: 1,
        },
      },
      requestBody: {
        chainId: 1,
        to: "0x99161BA892ECae335616624c84FAA418F64FF9A6",
        from: "0xd719fc03782E9617e81D138a3e9B1875da4D6a03",
        value: "0x0",
        functionName: "unlockAsset",
        data: "0x12345678",
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => sharedResult,
      }),
    );
    window.history.pushState(null, "", "/?simulationId=vb1_share-token");

    const { unmount } = renderPage();

    await vi.waitFor(() => {
      expect(callExecutionState.setResult).toHaveBeenCalledWith(sharedResult);
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/simulate-result/vb1_share-token",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(simulationOptionsState.setFromAddress).toHaveBeenCalledWith(
      sharedResult.requestBody.from,
    );
    expect(functionSelectionState.setEthValue).toHaveBeenCalledWith(
      sharedResult.requestBody.value,
    );
    expect(tokenMetadataState.setTokenSymbols).toHaveBeenCalledWith(
      sharedResult._tokenMeta.tokenSymbols,
    );
    expect(tokenMetadataState.setTokenDecimals).toHaveBeenCalledWith(
      sharedResult._tokenMeta.tokenDecimals,
    );
    expect(tokenMetadataState.setTokenPrices).toHaveBeenCalledWith(
      sharedResult._tokenMeta.tokenPrices,
    );
    expect(functionSelectionState.applyPendingArgs).toHaveBeenCalledWith({
      functionSig: sharedResult.requestBody.functionName,
      calldata: sharedResult.requestBody.data,
      timestamp: expect.any(Number),
    });
    expect(callExecutionState.setLoading).toHaveBeenLastCalledWith(false);

    unmount();
  });

  it("adds enriched balanceChanges to save metadata for simulated results", async () => {
    callExecutionState.result = {
      success: true,
      simulated: true,
      logs: [
        {
          address: TOKEN_ADDRESS,
          topics: [
            TRANSFER_TOPIC,
            padAddress(FROM_ADDRESS),
            padAddress(TO_ADDRESS),
          ],
          data: encodeUint256("1000000000"),
        },
      ],
      balanceChanges: [
        {
          address: FROM_ADDRESS,
          before: "10000000000000000000",
          after: "9000000000000000000",
          diff: "-1000000000000000000",
        },
      ],
    };
    tokenMetadataState.tokenSymbols = { [TOKEN_ADDRESS]: "USDC" };
    tokenMetadataState.tokenDecimals = { [TOKEN_ADDRESS]: 6 };
    tokenMetadataState.tokenPrices = {
      [NATIVE_TOKEN_ADDRESS]: 2500,
      [TOKEN_ADDRESS]: 1,
    };

    const { unmount } = renderPage();

    await vi.waitFor(() => {
      expect(callExecutionState.setSaveExtra).toHaveBeenCalledWith(
        expect.objectContaining({
          balanceChanges: expect.arrayContaining([
            expect.objectContaining({
              address: FROM_ADDRESS,
              tokenAddress: NATIVE_TOKEN_ADDRESS,
              amount: "-1",
              name: "ETH",
              price: 2500,
              valueUsd: -2500,
            }),
            expect.objectContaining({
              address: FROM_ADDRESS,
              tokenAddress: TOKEN_ADDRESS,
              amount: "-1,000",
              name: "USDC",
              price: 1,
              valueUsd: -1000,
            }),
          ]),
        }),
      );
    });

    unmount();
  });
});
