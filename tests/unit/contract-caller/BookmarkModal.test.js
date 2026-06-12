import { describe, it, expect, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import BookmarkModal from "../../../app/contract-caller/components/BookmarkModal.js";

function renderComponent(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(React.createElement(BookmarkModal, props));
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
  label: "",
  notes: "",
  onLabelChange: () => {},
  onNotesChange: () => {},
  onSave: () => {},
  onRemove: null,
  onClose: () => {},
};

describe("BookmarkModal", () => {
  it("renders nothing when open=false", () => {
    const { container, cleanup } = renderComponent({
      ...BASE_PROPS,
      open: false,
    });
    expect(container.querySelector("h3")).toBeNull();
    cleanup();
  });

  it("renders the modal when open=true", () => {
    const { container, cleanup } = renderComponent(BASE_PROPS);
    expect(container.querySelector("h3")).not.toBeNull();
    cleanup();
  });

  it('shows "Add to Address Book" title when label is empty', () => {
    const { container, cleanup } = renderComponent({
      ...BASE_PROPS,
      label: "",
    });
    expect(container.querySelector("h3").textContent).toBe(
      "Add to Address Book",
    );
    cleanup();
  });

  it('shows "Edit Bookmark" title when label is non-empty', () => {
    const { container, cleanup } = renderComponent({
      ...BASE_PROPS,
      label: "My Token",
    });
    expect(container.querySelector("h3").textContent).toBe("Edit Bookmark");
    cleanup();
  });

  it("displays the address", () => {
    const { container, cleanup } = renderComponent(BASE_PROPS);
    expect(container.textContent).toContain(BASE_PROPS.address);
    cleanup();
  });

  it("renders label input with the provided value", () => {
    const { container, cleanup } = renderComponent({
      ...BASE_PROPS,
      label: "USDC",
    });
    const input = container.querySelector('input[type="text"]');
    expect(input).not.toBeNull();
    expect(input.value).toBe("USDC");
    cleanup();
  });

  it("renders notes textarea with the provided value", () => {
    const { container, cleanup } = renderComponent({
      ...BASE_PROPS,
      notes: "Some notes",
    });
    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();
    expect(textarea.value).toBe("Some notes");
    cleanup();
  });

  it("calls onSave when Save button is clicked", () => {
    const onSave = vi.fn();
    const { container, cleanup } = renderComponent({ ...BASE_PROPS, onSave });
    const saveBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Save",
    );
    act(() => {
      saveBtn.click();
    });
    expect(onSave).toHaveBeenCalledOnce();
    cleanup();
  });

  it("calls onClose when Cancel button is clicked", () => {
    const onClose = vi.fn();
    const { container, cleanup } = renderComponent({ ...BASE_PROPS, onClose });
    const cancelBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Cancel",
    );
    act(() => {
      cancelBtn.click();
    });
    expect(onClose).toHaveBeenCalledOnce();
    cleanup();
  });

  it("does not render Remove button when onRemove is null", () => {
    const { container, cleanup } = renderComponent({
      ...BASE_PROPS,
      onRemove: null,
    });
    const removeBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Remove",
    );
    expect(removeBtn).toBeUndefined();
    cleanup();
  });

  it("renders Remove button and calls onRemove when clicked", () => {
    const onRemove = vi.fn();
    const { container, cleanup } = renderComponent({ ...BASE_PROPS, onRemove });
    const removeBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Remove",
    );
    expect(removeBtn).not.toBeUndefined();
    act(() => {
      removeBtn.click();
    });
    expect(onRemove).toHaveBeenCalledOnce();
    cleanup();
  });

  it("calls onLabelChange when label input changes", () => {
    const onLabelChange = vi.fn();
    const { container, cleanup } = renderComponent({
      ...BASE_PROPS,
      onLabelChange,
    });
    const input = container.querySelector('input[type="text"]');
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    ).set;
    act(() => {
      nativeInputValueSetter.call(input, "New Label");
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onLabelChange).toHaveBeenCalled();
    cleanup();
  });
});
