import { describe, it, expect, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import CalldataSection from "../../../app/contract-caller/components/CalldataSection.js";

// ---------------------------------------------------------------------------
// Minimal render helper (mirrors pattern used by other tests in this dir)
// ---------------------------------------------------------------------------
function renderComponent(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(React.createElement(CalldataSection, props));
  });
  return {
    container,
    cleanup() {
      document.body.removeChild(container);
    },
  };
}

function makeProps(overrides = {}) {
  return {
    expanded: false,
    onToggle: vi.fn(),
    value: "",
    onValueChange: vi.fn(),
    error: null,
    onDecodeAndFill: vi.fn(),
    disabled: false,
    ...overrides,
  };
}

describe("CalldataSection", () => {
  it("renders the toggle button in collapsed state", () => {
    const { container, cleanup } = renderComponent(makeProps());
    const buttons = container.querySelectorAll("button");
    // only the toggle button should appear when collapsed
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent).toMatch(/calldata/i);
    // textarea should not be rendered
    expect(container.querySelector("textarea")).toBeNull();
    cleanup();
  });

  it("renders body content when expanded", () => {
    const { container, cleanup } = renderComponent(
      makeProps({ expanded: true, value: "0xabcd" }),
    );
    expect(container.querySelector("textarea")).toBeTruthy();
    const buttons = container.querySelectorAll("button");
    // toggle + decode&fill
    expect(buttons).toHaveLength(2);
    expect(buttons[1].textContent).toMatch(/decode/i);
    cleanup();
  });

  it("calls onToggle when the toggle button is clicked", () => {
    const props = makeProps();
    const { container, cleanup } = renderComponent(props);
    act(() => {
      container.querySelector("button").click();
    });
    expect(props.onToggle).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("calls onValueChange when typing in the textarea", () => {
    const props = makeProps({ expanded: true, value: "" });
    const { container, cleanup } = renderComponent(props);
    const textarea = container.querySelector("textarea");
    act(() => {
      // Set the native value and fire a React-compatible input event
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value",
      ).set;
      nativeInputValueSetter.call(textarea, "0x1234");
      textarea.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(props.onValueChange).toHaveBeenCalledWith("0x1234");
    cleanup();
  });

  it("calls onDecodeAndFill when Decode & fill button is clicked", () => {
    const props = makeProps({ expanded: true, value: "0xdeadbeef" });
    const { container, cleanup } = renderComponent(props);
    const buttons = container.querySelectorAll("button");
    act(() => {
      // second button is Decode & fill
      buttons[1].click();
    });
    expect(props.onDecodeAndFill).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("shows error message when error prop is set", () => {
    const { container, cleanup } = renderComponent(
      makeProps({ expanded: true, error: "Invalid calldata" }),
    );
    expect(container.textContent).toContain("Invalid calldata");
    cleanup();
  });

  it("disables textarea and Decode & fill button when disabled=true", () => {
    const { container, cleanup } = renderComponent(
      makeProps({ expanded: true, value: "0xabc", disabled: true }),
    );
    expect(container.querySelector("textarea").disabled).toBe(true);
    const buttons = container.querySelectorAll("button");
    expect(buttons[1].disabled).toBe(true);
    cleanup();
  });

  it("disables Decode & fill button when value is blank", () => {
    const { container, cleanup } = renderComponent(
      makeProps({ expanded: true, value: "   " }),
    );
    const buttons = container.querySelectorAll("button");
    expect(buttons[1].disabled).toBe(true);
    cleanup();
  });
});
