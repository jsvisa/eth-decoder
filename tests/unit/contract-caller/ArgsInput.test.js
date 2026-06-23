import { describe, it, expect, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import ArgsInput from "../../../app/contract-caller/components/ArgsInput.js";

function renderComponent(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(React.createElement(ArgsInput, props));
  });
  return {
    container,
    cleanup() {
      act(() => {
        createRoot(container).unmount();
      });
      document.body.removeChild(container);
    },
  };
}

/** Fire a React-compatible change event on an input element. */
function fireInputChange(inputEl, newValue) {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  ).set;
  nativeSetter.call(inputEl, newValue);
  inputEl.dispatchEvent(new Event("change", { bubbles: true }));
}

const VIEW_FN = {
  type: "function",
  name: "balanceOf",
  stateMutability: "view",
  inputs: [{ name: "account", type: "address" }],
  outputs: [{ name: "", type: "uint256" }],
};

const PAYABLE_FN = {
  type: "function",
  name: "deposit",
  stateMutability: "payable",
  inputs: [],
  outputs: [],
};

const NO_ARGS_READ_FN = {
  type: "function",
  name: "totalSupply",
  stateMutability: "view",
  inputs: [],
  outputs: [{ name: "", type: "uint256" }],
};

const TUPLE_FN = {
  type: "function",
  name: "fillOrder",
  stateMutability: "nonpayable",
  inputs: [
    {
      name: "_order",
      type: "tuple",
      components: [
        { name: "maker", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "token", type: "address" },
      ],
    },
  ],
  outputs: [],
};

const TUPLE_ARRAY_FN = {
  type: "function",
  name: "executeRoute",
  stateMutability: "nonpayable",
  inputs: [
    {
      name: "_route",
      type: "tuple[]",
      components: [
        { name: "target", type: "address" },
        { name: "value", type: "uint256" },
        { name: "data", type: "bytes" },
      ],
    },
  ],
  outputs: [],
};

function makeProps(overrides = {}) {
  return {
    fn: null,
    args: [],
    onArgsChange: vi.fn(),
    fieldErrors: {},
    addressBook: [],
    onOpenBookmarkModal: vi.fn(),
    readBlockNumber: "",
    onReadBlockNumberChange: vi.fn(),
    ethValue: "",
    onEthValueChange: vi.fn(),
    ethValueUnit: "ETH",
    onEthValueUnitChange: vi.fn(),
    disabled: false,
    ...overrides,
  };
}

describe("ArgsInput", () => {
  it("renders nothing when fn is null", () => {
    const { container, cleanup } = renderComponent(makeProps());
    expect(container.firstChild).toBeNull();
    cleanup();
  });

  it("renders argument label for view function with inputs", () => {
    const { container, cleanup } = renderComponent(
      makeProps({ fn: VIEW_FN, args: [""] }),
    );
    expect(container.textContent).toContain("Arguments");
    expect(container.textContent).toContain("account (address)");
    cleanup();
  });

  it("renders block number input for view function with inputs", () => {
    const { container, cleanup } = renderComponent(
      makeProps({ fn: VIEW_FN, args: [""] }),
    );
    const blockInput = container.querySelector('input[placeholder="latest"]');
    expect(blockInput).toBeTruthy();
    cleanup();
  });

  it("renders ETH value input for payable function", () => {
    const { container, cleanup } = renderComponent(
      makeProps({ fn: PAYABLE_FN }),
    );
    expect(container.textContent).toContain("ETH Value");
    expect(container.textContent).toContain("payable");
    const ethInput = container.querySelector('input[placeholder="0.0"]');
    expect(ethInput).toBeTruthy();
    cleanup();
  });

  it("renders standalone block input for read-only function with no args", () => {
    const { container, cleanup } = renderComponent(
      makeProps({ fn: NO_ARGS_READ_FN }),
    );
    const blockInput = container.querySelector('input[placeholder="latest"]');
    expect(blockInput).toBeTruthy();
    expect(container.textContent).not.toContain("Arguments");
    cleanup();
  });

  it("calls onEthValueChange when ETH value input changes", () => {
    const onEthValueChange = vi.fn();
    const { container, cleanup } = renderComponent(
      makeProps({ fn: PAYABLE_FN, onEthValueChange }),
    );
    const ethInput = container.querySelector('input[placeholder="0.0"]');
    act(() => {
      fireInputChange(ethInput, "1.5");
    });
    expect(onEthValueChange).toHaveBeenCalledWith("1.5");
    cleanup();
  });

  it("calls onEthValueUnitChange when Wei button is clicked", () => {
    const onEthValueUnitChange = vi.fn();
    const { container, cleanup } = renderComponent(
      makeProps({ fn: PAYABLE_FN, onEthValueUnitChange }),
    );
    const buttons = container.querySelectorAll("button");
    const weiBtn = Array.from(buttons).find((b) => b.textContent === "Wei");
    expect(weiBtn).toBeTruthy();
    act(() => weiBtn.click());
    expect(onEthValueUnitChange).toHaveBeenCalledWith("Wei");
    cleanup();
  });

  it("calls onArgsChange with updated value when simple arg input changes", () => {
    const onArgsChange = vi.fn();
    const { container, cleanup } = renderComponent(
      makeProps({ fn: VIEW_FN, args: [""], onArgsChange }),
    );
    const argInput = container.querySelector(
      'input[placeholder="Enter address..."]',
    );
    expect(argInput).toBeTruthy();
    act(() => {
      fireInputChange(argInput, "0xabc");
    });
    expect(onArgsChange).toHaveBeenCalledWith(["0xabc"]);
    cleanup();
  });

  it("disables inputs when disabled prop is true", () => {
    const { container, cleanup } = renderComponent(
      makeProps({ fn: VIEW_FN, args: [""], disabled: true }),
    );
    const argInput = container.querySelector(
      'input[placeholder="Enter address..."]',
    );
    expect(argInput.disabled).toBe(true);
    cleanup();
  });

  it("renders tuple argument component fields instead of one flat input", () => {
    const { container, cleanup } = renderComponent(
      makeProps({
        fn: TUPLE_FN,
        args: [
          [
            "0x1111111111111111111111111111111111111111",
            "100",
            "0x2222222222222222222222222222222222222222",
          ],
        ],
      }),
    );

    expect(container.textContent).toContain("_order (tuple)");
    expect(container.textContent).toContain("maker (address)");
    expect(container.textContent).toContain("amount (uint256)");
    expect(container.textContent).toContain("token (address)");
    expect(
      container.querySelector(
        'input[value="0x1111111111111111111111111111111111111111"]',
      ),
    ).toBeTruthy();
    expect(
      container.querySelector('input[placeholder="Enter tuple..."]'),
    ).toBeNull();
    cleanup();
  });

  it("updates only the edited tuple component value", () => {
    const onArgsChange = vi.fn();
    const { container, cleanup } = renderComponent(
      makeProps({
        fn: TUPLE_FN,
        args: [
          [
            "0x1111111111111111111111111111111111111111",
            "100",
            "0x2222222222222222222222222222222222222222",
          ],
        ],
        onArgsChange,
      }),
    );

    const amountInput = container.querySelector('input[value="100"]');
    act(() => {
      fireInputChange(amountInput, "250");
    });

    expect(onArgsChange).toHaveBeenCalledWith([
      [
        "0x1111111111111111111111111111111111111111",
        "250",
        "0x2222222222222222222222222222222222222222",
      ],
    ]);
    cleanup();
  });

  it("renders tuple array item fields and can add another tuple item", () => {
    const onArgsChange = vi.fn();
    const { container, cleanup } = renderComponent(
      makeProps({
        fn: TUPLE_ARRAY_FN,
        args: [
          [["0x3333333333333333333333333333333333333333", "0", "0xabcdef"]],
        ],
        onArgsChange,
      }),
    );

    expect(container.textContent).toContain("_route (tuple[])");
    expect(container.textContent).toContain("#0");
    expect(container.textContent).toContain("target (address)");
    expect(container.textContent).toContain("value (uint256)");
    expect(container.textContent).toContain("data (bytes)");

    const addButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Add tuple",
    );
    expect(addButton).toBeTruthy();
    act(() => {
      addButton.click();
    });

    expect(onArgsChange).toHaveBeenCalledWith([
      [
        ["0x3333333333333333333333333333333333333333", "0", "0xabcdef"],
        ["", "", ""],
      ],
    ]);
    cleanup();
  });
});
