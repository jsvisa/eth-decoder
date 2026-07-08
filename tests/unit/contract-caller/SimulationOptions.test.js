import { describe, it, expect, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import SimulationOptions from "../../../app/contract-caller/components/SimulationOptions.js";

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
    forkBlockNumber: "",
    onForkBlockChange: vi.fn(),
    fromAddress: "",
    onFromAddressChange: vi.fn(),
    cheatcodes: makeCheatcodes(),
    onCheatcodesChange: vi.fn(),
    expanded: false,
    onToggleExpanded: vi.fn(),
    fieldErrors: {},
    onOpenBookmarkModal: vi.fn(),
    disabled: false,
    addressBook: [],
    ...overrides,
  };
}

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

  it("renders cheatcode checkboxes (deal, warp) always visible", () => {
    const { container, cleanup } = renderComponent(makeProps());
    expect(container.textContent).toContain("deal");
    expect(container.textContent).toContain("warp");
    expect(container.textContent).not.toContain("prank");
    cleanup();
  });

  it("renders cheatcode controls before the block input", () => {
    const { container, cleanup } = renderComponent(makeProps());
    const inputs = Array.from(container.querySelectorAll("input"));

    expect(inputs.slice(0, 2).map((input) => input.type)).toEqual([
      "checkbox",
      "checkbox",
    ]);
    expect(inputs[2].placeholder).toMatch(/block/i);

    cleanup();
  });

  it("keeps the from address field as the only prank control", () => {
    const { container, cleanup } = renderComponent(makeProps());

    const prankCheckbox = Array.from(
      container.querySelectorAll("input[type='checkbox']"),
    ).find((input) => input.closest("label")?.textContent?.includes("prank"));
    const fromInput = Array.from(
      container.querySelectorAll("input[type='text']"),
    ).find((input) => input.placeholder === "From (prank)");

    expect(prankCheckbox).toBeUndefined();
    expect(fromInput).toBeTruthy();
    cleanup();
  });

  it("does not render a prank expanded row when old state has prank enabled", () => {
    const cheatcodes = makeCheatcodes({
      prank: { enabled: true, address: "0xabc" },
    });
    const { container, cleanup } = renderComponent(
      makeProps({ expanded: true, cheatcodes }),
    );

    expect(container.textContent).not.toContain("vm.prank:");
    const prankInput = Array.from(
      container.querySelectorAll("input[type='text']"),
    ).find((input) => input.placeholder === "Impersonate Address");
    expect(prankInput).toBeUndefined();
    cleanup();
  });

  it("calls onCheatcodesChange when deal checkbox is toggled", () => {
    const props = makeProps();
    const { container, cleanup } = renderComponent(props);
    const checkboxes = container.querySelectorAll("input[type='checkbox']");
    act(() => {
      checkboxes[0].click();
    });
    expect(props.onCheatcodesChange).toHaveBeenCalledTimes(1);
    const called = props.onCheatcodesChange.mock.calls[0][0];
    expect(called.deal.enabled).toBe(true);
    cleanup();
  });

  it("shows cheatcode expanded rows when expanded=true and deal is enabled", () => {
    const cheatcodes = makeCheatcodes({
      deal: { enabled: true, address: "", amount: "" },
    });
    const { container, cleanup } = renderComponent(
      makeProps({ expanded: true, cheatcodes }),
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
      makeProps({ expanded: false, cheatcodes }),
    );
    expect(container.textContent).not.toContain("vm.deal:");
    cleanup();
  });

  it("shows warp expanded inputs when warp checkbox is enabled and expanded", () => {
    const cheatcodes = makeCheatcodes({
      warp: { enabled: true, address: "", timestamp: "" },
    });
    const { container, cleanup } = renderComponent(
      makeProps({ expanded: true, cheatcodes }),
    );
    expect(container.textContent).toContain("vm.warp:");
    const inputs = container.querySelectorAll("input[type='text']");
    const tsInput = Array.from(inputs).find(
      (i) => i.placeholder === "Unix Timestamp",
    );
    expect(tsInput).toBeTruthy();
    cleanup();
  });
});
