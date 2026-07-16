/**
 * Tests for ContractAddressInput presentational component.
 * Uses react-dom/client + act() (no @testing-library/react JSX transform needed).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import ContractAddressInput from "../../../app/contract-caller/components/ContractAddressInput.js";

// ---------------------------------------------------------------------------
// Minimal render helper
// ---------------------------------------------------------------------------
function renderComponent(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root;
  act(() => {
    root = createRoot(container);
    root.render(React.createElement(ContractAddressInput, props));
  });
  return {
    container,
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

// ---------------------------------------------------------------------------
// Default props
// ---------------------------------------------------------------------------
const BASE_PROPS = {
  address: "",
  onAddressChange: vi.fn(),
  addressBook: [],
  cachedAddresses: [],
  contractName: null,
  onFetchAbi: vi.fn(),
  fetchingAbi: false,
  fieldError: null,
  onOpenBookmarkModal: vi.fn(),
  disabled: false,
};

describe("ContractAddressInput", () => {
  let cleanup;

  afterEach(() => {
    if (cleanup) {
      cleanup();
      cleanup = null;
    }
  });

  it("renders the label, address input, and Fetch ABI button", () => {
    const { container, unmount } = renderComponent(BASE_PROPS);
    cleanup = unmount;

    expect(container.textContent).toContain("Contract Address");
    expect(
      container.querySelector("input[placeholder='0x...']"),
    ).not.toBeNull();
    expect(container.textContent).toContain("Fetch ABI");
  });

  it("shows 'Fetching...' label while fetchingAbi is true", () => {
    const { container, unmount } = renderComponent({
      ...BASE_PROPS,
      fetchingAbi: true,
    });
    cleanup = unmount;
    expect(container.textContent).toContain("Fetching...");
  });

  it("calls onAddressChange when the user types into the address input", () => {
    const onAddressChange = vi.fn();
    const { container, unmount } = renderComponent({
      ...BASE_PROPS,
      onAddressChange,
    });
    cleanup = unmount;

    const input = container.querySelector("input[placeholder='0x...']");
    // React reads e.target.value from the nativeEvent; we must set the value
    // on the input before dispatching the change event and use Object.defineProperty
    // so React's synthetic event system picks up the right value.
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    ).set;
    act(() => {
      nativeInputValueSetter.call(input, "0xabc");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onAddressChange).toHaveBeenCalledWith("0xabc");
  });

  it("calls onFetchAbi when the Fetch ABI button is clicked", () => {
    const onFetchAbi = vi.fn();
    const { container, unmount } = renderComponent({
      ...BASE_PROPS,
      onFetchAbi,
    });
    cleanup = unmount;

    const btn = [...container.querySelectorAll("button")].find((b) =>
      b.textContent.includes("Fetch ABI"),
    );
    act(() => btn.click());
    expect(onFetchAbi).toHaveBeenCalledTimes(1);
  });

  it("disables the Fetch ABI button when disabled prop is true", () => {
    const { container, unmount } = renderComponent({
      ...BASE_PROPS,
      disabled: true,
    });
    cleanup = unmount;

    const btn = [...container.querySelectorAll("button")].find((b) =>
      b.textContent.includes("Fetch ABI"),
    );
    expect(btn.disabled).toBe(true);
  });

  it("shows the contractName badge when provided", () => {
    const { container, unmount } = renderComponent({
      ...BASE_PROPS,
      contractName: "MyToken",
    });
    cleanup = unmount;
    expect(container.textContent).toContain("MyToken");
  });

  it("shows a field error message when fieldError is set", () => {
    const { container, unmount } = renderComponent({
      ...BASE_PROPS,
      fieldError: "Invalid address",
    });
    cleanup = unmount;
    expect(container.textContent).toContain("Invalid address");
  });

  it("shows bookmark label when the current address is in the addressBook", () => {
    const addressBook = [
      {
        address: "0x1234567890abcdef1234567890abcdef12345678",
        label: "Treasury",
      },
    ];
    const { container, unmount } = renderComponent({
      ...BASE_PROPS,
      address: "0x1234567890abcdef1234567890abcdef12345678",
      addressBook,
    });
    cleanup = unmount;
    expect(container.textContent).toContain("Treasury");
  });

  it("shows autocomplete suggestions when input is focused and suggestions exist", () => {
    const cachedAddresses = [
      {
        chain: "1",
        address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        contractName: "ExampleDAO",
      },
    ];
    // Render with showSuggestions pre-triggered by providing a component
    // that we then focus in act.
    let root;
    const c = document.createElement("div");
    document.body.appendChild(c);
    act(() => {
      root = createRoot(c);
      root.render(
        React.createElement(ContractAddressInput, {
          ...BASE_PROPS,
          cachedAddresses,
        }),
      );
    });
    cleanup = () => {
      act(() => root.unmount());
      c.remove();
    };

    const input = c.querySelector("input[placeholder='0x...']");
    act(() => {
      input.focus();
      input.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
    });
    expect(c.textContent).toContain("ExampleDAO");
  });

  it("calls onAddressChange with the selected address when a suggestion is clicked", () => {
    const onAddressChange = vi.fn();
    const targetAddress = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const cachedAddresses = [
      { chain: "1", address: targetAddress, contractName: "ExampleDAO" },
    ];

    let root;
    const c = document.createElement("div");
    document.body.appendChild(c);
    act(() => {
      root = createRoot(c);
      root.render(
        React.createElement(ContractAddressInput, {
          ...BASE_PROPS,
          onAddressChange,
          cachedAddresses,
        }),
      );
    });
    cleanup = () => {
      act(() => root.unmount());
      c.remove();
    };

    // Focus to open suggestions
    const input = c.querySelector("input[placeholder='0x...']");
    act(() => {
      input.focus();
      input.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
    });

    // Find and click the suggestion item that contains ExampleDAO
    const suggestionEl =
      [...c.querySelectorAll("div")].find(
        (d) => d.textContent.includes("ExampleDAO") && d.onclick !== null,
      ) ||
      [...c.querySelectorAll("div")].find(
        (d) => d.textContent.includes("ExampleDAO") && d.children.length > 0,
      );
    act(() => suggestionEl.click());
    expect(onAddressChange).toHaveBeenCalledWith(targetAddress);
  });
});
