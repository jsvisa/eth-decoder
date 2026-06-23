import { describe, it, expect, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import SimulationOptions from "../../../app/contract-caller/components/SimulationOptions.js";

// CSS modules resolve to empty strings in jsdom — we query by text / role / placeholder.

function renderComponent(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(React.createElement(SimulationOptions, props));
  });
  return {
    container,
    cleanup() {
      document.body.removeChild(container);
    },
  };
}

function makeCheatcodes(overrides = {}) {
  return {
    deal: { enabled: false, address: "", amount: "" },
    prank: { enabled: false, address: "" },
    warp: { enabled: false, timestamp: "" },
    ...overrides,
  };
}

function makeProps(overrides = {}) {
  return {
    useLocalSimulation: true,
    forkBlockNumber: "",
    onForkBlockChange: vi.fn(),
    fromAddress: "",
    onFromAddressChange: vi.fn(),
    cheatcodes: makeCheatcodes(),
    onCheatcodesChange: vi.fn(),
    balanceOverrides: [],
    onBalanceOverridesChange: vi.fn(),
    storageOverrides: [],
    onStorageOverridesChange: vi.fn(),
    timestampOverride: "",
    onTimestampOverrideChange: vi.fn(),
    expanded: false,
    onToggleExpanded: vi.fn(),
    fieldErrors: {},
    onOpenBookmarkModal: vi.fn(),
    disabled: false,
    addressBook: [],
    ...overrides,
  };
}

/** Fire a change event and set input value via native setter (works in jsdom). */
function fireInputChange(input, value) {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  ).set;
  nativeSetter.call(input, value);
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("SimulationOptions", () => {
  it("renders the section label", () => {
    const { container, cleanup } = renderComponent(makeProps());
    expect(container.textContent).toMatch(/simulation options/i);
    cleanup();
  });

  it("shows collapsed toggle indicator (▶) when expanded=false", () => {
    const { container, cleanup } = renderComponent(
      makeProps({ expanded: false }),
    );
    const toggleBtn = container.querySelector("button");
    expect(toggleBtn.textContent).toBe("▶");
    cleanup();
  });

  it("shows expanded toggle indicator (▼) when expanded=true", () => {
    const { container, cleanup } = renderComponent(
      makeProps({ expanded: true }),
    );
    const toggleBtn = container.querySelector("button");
    expect(toggleBtn.textContent).toBe("▼");
    cleanup();
  });

  it("calls onToggleExpanded when toggle button is clicked", () => {
    const props = makeProps();
    const { container, cleanup } = renderComponent(props);
    act(() => {
      container.querySelector("button").click();
    });
    expect(props.onToggleExpanded).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("renders fork block number input with placeholder", () => {
    const { container, cleanup } = renderComponent(makeProps());
    const inputs = container.querySelectorAll("input[type='text']");
    const forkInput = Array.from(inputs).find(
      (i) => i.placeholder && /block/i.test(i.placeholder),
    );
    expect(forkInput).toBeTruthy();
    cleanup();
  });

  it("calls onForkBlockChange when fork block input changes", () => {
    const props = makeProps();
    const { container, cleanup } = renderComponent(props);
    const inputs = container.querySelectorAll("input[type='text']");
    const forkInput = Array.from(inputs).find(
      (i) => i.placeholder && /block/i.test(i.placeholder),
    );
    act(() => {
      fireInputChange(forkInput, "12345");
    });
    expect(props.onForkBlockChange).toHaveBeenCalledWith("12345");
    cleanup();
  });

  it("renders from address input with placeholder", () => {
    const { container, cleanup } = renderComponent(makeProps());
    const inputs = container.querySelectorAll("input[type='text']");
    const fromInput = Array.from(inputs).find(
      (i) => i.placeholder && /prank/i.test(i.placeholder),
    );
    expect(fromInput).toBeTruthy();
    cleanup();
  });

  it("calls onFromAddressChange when from address input changes", () => {
    const props = makeProps();
    const { container, cleanup } = renderComponent(props);
    const inputs = container.querySelectorAll("input[type='text']");
    const fromInput = Array.from(inputs).find(
      (i) => i.placeholder && /prank/i.test(i.placeholder),
    );
    act(() => {
      fireInputChange(fromInput, "0xabc");
    });
    expect(props.onFromAddressChange).toHaveBeenCalledWith("0xabc");
    cleanup();
  });

  it("renders cheatcode checkboxes when useLocalSimulation=true", () => {
    const { container, cleanup } = renderComponent(
      makeProps({ useLocalSimulation: true }),
    );
    expect(container.textContent).toContain("deal");
    expect(container.textContent).toContain("prank");
    expect(container.textContent).toContain("warp");
    cleanup();
  });

  it("renders cheatcode controls before the block input in local simulation mode", () => {
    const { container, cleanup } = renderComponent(
      makeProps({ useLocalSimulation: true }),
    );
    const inputs = Array.from(container.querySelectorAll("input"));

    expect(inputs.slice(0, 3).map((input) => input.type)).toEqual([
      "checkbox",
      "checkbox",
      "checkbox",
    ]);
    expect(inputs[3].placeholder).toMatch(/block/i);

    cleanup();
  });

  it("does not render cheatcode checkboxes when useLocalSimulation=false", () => {
    const { container, cleanup } = renderComponent(
      makeProps({ useLocalSimulation: false }),
    );
    // No deal/prank/warp text (Tenderly mode)
    const checkboxes = container.querySelectorAll("input[type='checkbox']");
    expect(checkboxes).toHaveLength(0);
    cleanup();
  });

  it("calls onCheatcodesChange when deal checkbox is toggled", () => {
    const props = makeProps({ useLocalSimulation: true });
    const { container, cleanup } = renderComponent(props);
    const checkboxes = container.querySelectorAll("input[type='checkbox']");
    // deal is the first checkbox
    act(() => {
      checkboxes[0].click();
    });
    expect(props.onCheatcodesChange).toHaveBeenCalledTimes(1);
    const called = props.onCheatcodesChange.mock.calls[0][0];
    expect(called.deal.enabled).toBe(true);
    cleanup();
  });

  it("renders + Balance and + Storage buttons and timestamp input for Tenderly mode", () => {
    const { container, cleanup } = renderComponent(
      makeProps({ useLocalSimulation: false }),
    );
    const buttons = container.querySelectorAll("button");
    const btnTexts = Array.from(buttons).map((b) => b.textContent.trim());
    expect(btnTexts).toContain("+ Balance");
    expect(btnTexts).toContain("+ Storage");
    const inputs = container.querySelectorAll("input[type='text']");
    const tsInput = Array.from(inputs).find(
      (i) => i.placeholder && /timestamp/i.test(i.placeholder),
    );
    expect(tsInput).toBeTruthy();
    cleanup();
  });

  it("calls onBalanceOverridesChange when + Balance button is clicked", () => {
    const props = makeProps({ useLocalSimulation: false });
    const { container, cleanup } = renderComponent(props);
    const buttons = container.querySelectorAll("button");
    const balanceBtn = Array.from(buttons).find(
      (b) => b.textContent.trim() === "+ Balance",
    );
    act(() => {
      balanceBtn.click();
    });
    expect(props.onBalanceOverridesChange).toHaveBeenCalledWith([
      { address: "", balance: "" },
    ]);
    cleanup();
  });

  it("calls onStorageOverridesChange when + Storage button is clicked", () => {
    const props = makeProps({ useLocalSimulation: false });
    const { container, cleanup } = renderComponent(props);
    const buttons = container.querySelectorAll("button");
    const storageBtn = Array.from(buttons).find(
      (b) => b.textContent.trim() === "+ Storage",
    );
    act(() => {
      storageBtn.click();
    });
    expect(props.onStorageOverridesChange).toHaveBeenCalledWith([
      { address: "", slot: "", value: "" },
    ]);
    cleanup();
  });

  it("renders balance override rows", () => {
    const balanceOverrides = [{ address: "0x123", balance: "1.5" }];
    const { container, cleanup } = renderComponent(
      makeProps({ useLocalSimulation: false, balanceOverrides }),
    );
    expect(container.textContent).toContain("Balance Overrides:");
    const inputs = container.querySelectorAll("input[type='text']");
    const addressInput = Array.from(inputs).find((i) => i.value === "0x123");
    expect(addressInput).toBeTruthy();
    const balInput = Array.from(inputs).find((i) => i.value === "1.5");
    expect(balInput).toBeTruthy();
    cleanup();
  });

  it("renders storage override rows", () => {
    const storageOverrides = [{ address: "0xabc", slot: "0x0", value: "0x1" }];
    const { container, cleanup } = renderComponent(
      makeProps({ useLocalSimulation: false, storageOverrides }),
    );
    expect(container.textContent).toContain("Storage Overrides:");
    const inputs = container.querySelectorAll("input[type='text']");
    const addrInput = Array.from(inputs).find((i) => i.value === "0xabc");
    expect(addrInput).toBeTruthy();
    cleanup();
  });

  it("calls onBalanceOverridesChange(filtered) when a balance override × is clicked", () => {
    const balanceOverrides = [
      { address: "0x1", balance: "1" },
      { address: "0x2", balance: "2" },
    ];
    const props = makeProps({ useLocalSimulation: false, balanceOverrides });
    const { container, cleanup } = renderComponent(props);
    const removeBtns = Array.from(container.querySelectorAll("button")).filter(
      (b) => b.title === "Remove override",
    );
    act(() => {
      removeBtns[0].click();
    });
    expect(props.onBalanceOverridesChange).toHaveBeenCalledWith([
      { address: "0x2", balance: "2" },
    ]);
    cleanup();
  });

  it("shows cheatcode expanded rows when expanded=true and deal is enabled", () => {
    const cheatcodes = makeCheatcodes({
      deal: { enabled: true, address: "", amount: "" },
    });
    const { container, cleanup } = renderComponent(
      makeProps({ useLocalSimulation: true, expanded: true, cheatcodes }),
    );
    expect(container.textContent).toContain("vm.deal:");
    const inputs = container.querySelectorAll("input[type='text']");
    const addrInput = Array.from(inputs).find(
      (i) => i.placeholder === "Address",
    );
    expect(addrInput).toBeTruthy();
    const ethInput = Array.from(inputs).find(
      (i) => i.placeholder === "ETH Amount",
    );
    expect(ethInput).toBeTruthy();
    cleanup();
  });

  it("does not show expanded cheatcode rows when expanded=false", () => {
    const cheatcodes = makeCheatcodes({
      deal: { enabled: true, address: "", amount: "" },
    });
    const { container, cleanup } = renderComponent(
      makeProps({ useLocalSimulation: true, expanded: false, cheatcodes }),
    );
    expect(container.textContent).not.toContain("vm.deal:");
    cleanup();
  });

  it("calls onTimestampOverrideChange when timestamp input changes", () => {
    const props = makeProps({ useLocalSimulation: false });
    const { container, cleanup } = renderComponent(props);
    const inputs = container.querySelectorAll("input[type='text']");
    const tsInput = Array.from(inputs).find(
      (i) => i.placeholder && /timestamp/i.test(i.placeholder),
    );
    act(() => {
      fireInputChange(tsInput, "1700000000");
    });
    expect(props.onTimestampOverrideChange).toHaveBeenCalledWith("1700000000");
    cleanup();
  });
});
