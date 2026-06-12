import { describe, it, expect, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import FunctionEventsTabs from "../../../app/contract-caller/components/FunctionEventsTabs.js";

// ---------------------------------------------------------------------------
// Minimal render helper (mirrors pattern used by other tests in this dir)
// ---------------------------------------------------------------------------
function renderComponent(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(
      React.createElement(FunctionEventsTabs, props),
    );
  });
  return {
    container,
    cleanup() {
      document.body.removeChild(container);
    },
  };
}

describe("FunctionEventsTabs", () => {
  it("renders both tab buttons with counts", () => {
    const { container, cleanup } = renderComponent({
      activeTab: "functions",
      onTabChange: () => {},
      functionsContent: React.createElement("div", null, "functions content"),
      eventsContent: React.createElement("div", null, "events content"),
      functionsCount: 5,
      eventsCount: 3,
    });

    const buttons = container.querySelectorAll("button");
    expect(buttons).toHaveLength(2);
    expect(buttons[0].textContent).toBe("Functions (5)");
    expect(buttons[1].textContent).toBe("Events (3)");

    cleanup();
  });

  it("shows functions content when activeTab is 'functions'", () => {
    const { container, cleanup } = renderComponent({
      activeTab: "functions",
      onTabChange: () => {},
      functionsContent: React.createElement("div", null, "functions slot"),
      eventsContent: React.createElement("div", null, "events slot"),
      functionsCount: 2,
      eventsCount: 1,
    });

    expect(container.textContent).toContain("functions slot");
    expect(container.textContent).not.toContain("events slot");

    cleanup();
  });

  it("shows events content when activeTab is 'events'", () => {
    const { container, cleanup } = renderComponent({
      activeTab: "events",
      onTabChange: () => {},
      functionsContent: React.createElement("div", null, "functions slot"),
      eventsContent: React.createElement("div", null, "events slot"),
      functionsCount: 2,
      eventsCount: 1,
    });

    expect(container.textContent).toContain("events slot");
    expect(container.textContent).not.toContain("functions slot");

    cleanup();
  });

  it("calls onTabChange with 'events' when the Events button is clicked", () => {
    const onTabChange = vi.fn();
    const { container, cleanup } = renderComponent({
      activeTab: "functions",
      onTabChange,
      functionsContent: null,
      eventsContent: null,
      functionsCount: 4,
      eventsCount: 2,
    });

    const eventsButton = container.querySelectorAll("button")[1];
    act(() => {
      eventsButton.click();
    });

    expect(onTabChange).toHaveBeenCalledOnce();
    expect(onTabChange).toHaveBeenCalledWith("events");

    cleanup();
  });

  it("calls onTabChange with 'functions' when the Functions button is clicked", () => {
    const onTabChange = vi.fn();
    const { container, cleanup } = renderComponent({
      activeTab: "events",
      onTabChange,
      functionsContent: null,
      eventsContent: null,
      functionsCount: 4,
      eventsCount: 2,
    });

    const functionsButton = container.querySelectorAll("button")[0];
    act(() => {
      functionsButton.click();
    });

    expect(onTabChange).toHaveBeenCalledOnce();
    expect(onTabChange).toHaveBeenCalledWith("functions");

    cleanup();
  });
});
