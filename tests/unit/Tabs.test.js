import { describe, it, expect, beforeEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import Tabs from "../../app/components/Tabs.js";

const STORAGE_KEY = "test_tabs_v1";

function renderTabs(overrides = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const renderTab =
    overrides.renderTab ||
    ((tab) =>
      React.createElement(
        "div",
        { "data-testid": `tab-${tab.id}` },
        tab.title,
      ));
  act(() => {
    createRoot(container).render(
      React.createElement(Tabs, {
        storageKey: STORAGE_KEY,
        newTabTitle: "New",
        defaultTabId: "tab-1",
        renderTab,
        ...overrides,
      }),
    );
  });
  return {
    container,
    cleanup() {
      act(() => {
        document.body.removeChild(container);
      });
    },
  };
}

function click(container, el) {
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("Tabs", () => {
  it("renders the default tab and an Add Tab button", () => {
    const { container, cleanup } = renderTabs();
    expect(container.textContent).toContain("+ Add Tab");
    expect(container.querySelector('[data-testid="tab-tab-1"]')).toBeTruthy();
    cleanup();
  });

  it("adds a new tab and makes it active", () => {
    const { container, cleanup } = renderTabs();
    const addBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "+ Add Tab",
    );
    click(container, addBtn);
    expect(container.querySelectorAll('[role="tab"]').length).toBe(2);
    // New tab content is mounted (lazy mount on activation) and visible
    const panels = Array.from(container.querySelectorAll('[role="tabpanel"]'));
    expect(panels.length).toBe(2);
    const visiblePanels = panels.filter((p) => p.style.display !== "none");
    expect(visiblePanels.length).toBe(1);
    cleanup();
  });

  it("switches back to a previously created tab without losing its content", () => {
    const { container, cleanup } = renderTabs();
    const addBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "+ Add Tab",
    );
    click(container, addBtn);
    const tabs = Array.from(container.querySelectorAll('[role="tab"]'));
    click(container, tabs[0]);
    // Both panels stay mounted; the first is now visible
    const panels = Array.from(container.querySelectorAll('[role="tabpanel"]'));
    expect(panels.length).toBe(2);
    const visiblePanels = panels.filter((p) => p.style.display !== "none");
    expect(visiblePanels.length).toBe(1);
    expect(
      visiblePanels[0].querySelector('[data-testid="tab-tab-1"]'),
    ).toBeTruthy();
    cleanup();
  });

  it("closes a tab and keeps the rest", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { container, cleanup } = renderTabs();
    const addBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "+ Add Tab",
    );
    click(container, addBtn);
    const closeBtn = container.querySelector(
      '[role="tab"] [aria-label="Close New"]',
    );
    click(container, closeBtn);
    expect(window.confirm).toHaveBeenCalled();
    expect(container.querySelectorAll('[role="tab"]').length).toBe(1);
    cleanup();
  });

  it("keeps the tab when the close confirm is cancelled", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const { container, cleanup } = renderTabs();
    const addBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "+ Add Tab",
    );
    click(container, addBtn);
    const closeBtn = container.querySelector(
      '[role="tab"] [aria-label="Close New"]',
    );
    click(container, closeBtn);
    expect(window.confirm).toHaveBeenCalled();
    expect(container.querySelectorAll('[role="tab"]').length).toBe(2);
    cleanup();
  });

  it("persists the tab list to localStorage", () => {
    const { container, cleanup } = renderTabs();
    const addBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "+ Add Tab",
    );
    click(container, addBtn);
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(stored.tabs.length).toBe(2);
    expect(stored.activeId).toBeTruthy();
    cleanup();
  });

  it("reorders tabs by dragging", () => {
    const renderTab = (tab) =>
      React.createElement("div", { "data-testid": `tab-${tab.id}` }, tab.id);
    const { container, cleanup } = renderTabs({ renderTab });
    const addBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "+ Add Tab",
    );
    click(container, addBtn);
    click(container, addBtn);

    // Get the tab IDs in order by looking at the tab elements themselves
    const getTabIds = () =>
      Array.from(container.querySelectorAll('[role="tab"]')).map(
        (tabEl) => tabEl.textContent.trim().split("\n")[0],
      );

    // After initial setup: tab-1, [new UUID], [new UUID]
    const initialIds = getTabIds();
    expect(initialIds.length).toBe(3);
    expect(initialIds[0]).toBe("tab-1");

    const tabEls = () => Array.from(container.querySelectorAll('[role="tab"]'));

    const stubGeometry = () =>
      tabEls().forEach((el, i) => {
        el.getBoundingClientRect = () => ({
          left: i * 100,
          top: 0,
          width: 100,
          height: 40,
          right: (i + 1) * 100,
          bottom: 40,
        });
      });

    const dragStart = (el) => {
      const ev = new MouseEvent("dragstart", { bubbles: true });
      ev.dataTransfer = { effectAllowed: "", setData() {} };
      act(() => {
        el.dispatchEvent(ev);
      });
    };
    const dragOver = (el, clientX) => {
      act(() => {
        el.dispatchEvent(
          new MouseEvent("dragover", { bubbles: true, clientX }),
        );
      });
    };
    const dragEnd = (el) => {
      act(() => {
        el.dispatchEvent(new MouseEvent("dragend", { bubbles: true }));
      });
    };

    // Drag tab at index 2 over the left half of tab at index 0
    stubGeometry();
    dragStart(tabEls()[2]);
    dragOver(tabEls()[0], 0);
    dragEnd(tabEls()[0]);
    let ids = getTabIds();
    expect(ids[0]).toBe(initialIds[2]);
    expect(ids[1]).toBe("tab-1");
    expect(ids[2]).toBe(initialIds[1]);

    // Drag tab at current index 1 over the right half of tab at index 0
    stubGeometry();
    dragStart(tabEls()[1]);
    dragOver(tabEls()[0], 100);
    dragEnd(tabEls()[0]);
    ids = getTabIds();
    expect(ids[0]).toBe(initialIds[2]);
    expect(ids[1]).toBe(initialIds[1]);
    expect(ids[2]).toBe("tab-1");

    cleanup();
  });

  it("restores persisted tabs on load and marks the active one for URL hydration", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        tabs: [
          { id: "tab-a", title: "Alpha" },
          { id: "tab-b", title: "Beta" },
        ],
        activeId: "tab-b",
      }),
    );
    let hydrated;
    const renderTab = vi.fn((tab, ctx) => {
      if (ctx.hydrateFromUrl) hydrated = tab.id;
      return React.createElement(
        "div",
        { "data-testid": `tab-${tab.id}` },
        tab.title,
      );
    });
    const { container, cleanup } = renderTabs({ renderTab });
    // Only the active tab is mounted on load
    expect(container.querySelector('[data-testid="tab-tab-b"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="tab-tab-a"]')).toBeFalsy();
    expect(hydrated).toBe("tab-b");
    // Select the other tab -> it mounts lazily, no URL hydration
    const tabs = Array.from(container.querySelectorAll('[role="tab"]'));
    click(container, tabs[0]);
    expect(container.querySelector('[data-testid="tab-tab-a"]')).toBeTruthy();
    cleanup();
  });

  it("renames a tab via the renderTab onRename callback", () => {
    let rename;
    const renderTab = vi.fn((tab, ctx) => {
      rename = ctx.onRename;
      return React.createElement(
        "div",
        { "data-testid": `tab-${tab.id}` },
        tab.title,
      );
    });
    const { container, cleanup } = renderTabs({ renderTab });
    act(() => {
      rename("myTitle");
    });
    expect(container.querySelector('[role="tab"]').textContent).toContain(
      "myTitle",
    );
    cleanup();
  });

  it("keeps a manually renamed tab across a refresh even when auto-rename fires", () => {
    // Simulate the workspace auto-renaming on every mount (e.g. contract name),
    // the way ContractCallerWorkspace's useEffect calls onRename on mount.
    const AutoRenameWorkspace = ({ tab, ctx }) => {
      const { useEffect } = React;
      useEffect(() => {
        ctx.onRename("AutoName");
      }, []);
      return React.createElement(
        "div",
        { "data-testid": `tab-${tab.id}` },
        tab.title,
      );
    };
    const renderTab = vi.fn((tab, ctx) =>
      React.createElement(AutoRenameWorkspace, { tab, ctx }),
    );

    // 1. Mount, then the user manually renames via double-click + inline edit.
    const first = renderTabs({ renderTab });
    const tabEl = first.container.querySelector('[role="tab"]');
    act(() => {
      tabEl.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    const input = first.container.querySelector("input");
    expect(input).toBeTruthy();
    act(() => {
      input.value = "My Custom Name";
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    expect(first.container.querySelector('[role="tab"]').textContent).toContain(
      "My Custom Name",
    );
    // Persisted tab list carries the renamed flag.
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(saved.tabs[0].renamed).toBe(true);
    expect(saved.tabs[0].title).toBe("My Custom Name");
    first.cleanup();

    // 2. "Refresh" — remount with the same auto-renaming renderTab.
    const second = renderTabs({ renderTab });
    // Auto-rename must NOT clobber the user's custom title.
    expect(
      second.container.querySelector('[role="tab"]').textContent,
    ).toContain("My Custom Name");
    second.cleanup();
  });
});
