import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React, { act } from "react";
import { renderToString } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { ThemeProvider, useTheme } from "../../app/contexts/ThemeContext";

// jsdom does not implement matchMedia
beforeEach(() => {
  window.matchMedia =
    window.matchMedia ||
    vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

afterEach(() => {
  document.documentElement.removeAttribute("data-theme");
});

function ThemeProbe() {
  const { theme, toggleTheme } = useTheme();
  return React.createElement(
    "button",
    {
      "data-testid": "probe",
      onClick: toggleTheme,
    },
    theme,
  );
}

function renderProviders(children) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root;
  act(() => {
    root = createRoot(container).render(
      React.createElement(ThemeProvider, null, children),
    );
  });
  return {
    container,
    cleanup() {
      act(() => {
        root?.unmount?.();
        document.body.removeChild(container);
      });
    },
  };
}

describe("ThemeProvider", () => {
  it("renders children during SSR instead of an empty body", () => {
    const html = renderToString(
      React.createElement(
        ThemeProvider,
        null,
        React.createElement("div", { "data-testid": "ssr-child" }, "content"),
      ),
    );
    // Previously the provider returned null pre-mount, producing empty SSR
    expect(html).toContain("ssr-child");
    expect(html).toContain("content");
  });

  it("renders children on first client render (pre-mount)", () => {
    const { cleanup } = renderProviders(
      React.createElement("div", { "data-testid": "client-child" }, "hello"),
    );
    try {
      expect(document.querySelector("[data-testid=client-child]")).toBeTruthy();
    } finally {
      cleanup();
    }
  });

  it("applies a stored theme and persists toggles", () => {
    localStorage.setItem("theme_preference", "dark");

    const { cleanup } = renderProviders(React.createElement(ThemeProbe));
    try {
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
      const probe = document.querySelector("[data-testid=probe]");
      expect(probe.textContent).toBe("dark");

      act(() => {
        probe.click();
      });

      expect(document.documentElement.getAttribute("data-theme")).toBe("light");
      expect(localStorage.getItem("theme_preference")).toBe("light");
    } finally {
      cleanup();
    }
  });

  it("exposes the default light theme without storage or system preference", () => {
    const { cleanup } = renderProviders(React.createElement(ThemeProbe));
    try {
      expect(document.querySelector("[data-testid=probe]").textContent).toBe(
        "light",
      );
      expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    } finally {
      cleanup();
    }
  });
});
