import { describe, it, expect, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import CallActionBar from "../../../app/contract-caller/components/CallActionBar.js";

// ---------------------------------------------------------------------------
// Minimal render helper (mirrors pattern used by other tests in this dir)
// ---------------------------------------------------------------------------
function renderComponent(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(React.createElement(CallActionBar, props));
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
    selectedFunction: "transfer",
    isWrite: false,
    loading: false,
    useLocalSimulation: false,
    simProgress: null,
    sessionActive: false,
    sessionBlock: null,
    sessionStarting: false,
    onCall: vi.fn(),
    onCancel: vi.fn(),
    onCopyCalldata: vi.fn(),
    onShareUrl: vi.fn(),
    onStartSession: vi.fn(),
    onResetSession: vi.fn(),
    calldataCopied: false,
    urlCopied: false,
    activeTab: "functions",
    ...overrides,
  };
}

describe("CallActionBar", () => {
  it("renders Call Contract button when isWrite is false", () => {
    const { container, cleanup } = renderComponent(makeProps());
    const btns = container.querySelectorAll("button");
    const callBtn = Array.from(btns).find((b) =>
      /call contract/i.test(b.textContent),
    );
    expect(callBtn).toBeTruthy();
    cleanup();
  });

  it("renders Simulate Call button when isWrite is true", () => {
    const { container, cleanup } = renderComponent(
      makeProps({ isWrite: true }),
    );
    expect(container.textContent).toMatch(/simulate call/i);
    cleanup();
  });

  it("shows Simulating... when loading and isWrite is true", () => {
    const { container, cleanup } = renderComponent(
      makeProps({ loading: true, isWrite: true }),
    );
    expect(container.textContent).toMatch(/simulating/i);
    cleanup();
  });

  it("shows Calling... when loading and isWrite is false", () => {
    const { container, cleanup } = renderComponent(
      makeProps({ loading: true, isWrite: false }),
    );
    expect(container.textContent).toMatch(/calling/i);
    cleanup();
  });

  it("disables call button when no selectedFunction", () => {
    const { container, cleanup } = renderComponent(
      makeProps({ selectedFunction: "" }),
    );
    const btns = container.querySelectorAll("button");
    const callBtn = btns[0];
    expect(callBtn.disabled).toBe(true);
    cleanup();
  });

  it("disables call button while loading", () => {
    const { container, cleanup } = renderComponent(
      makeProps({ loading: true }),
    );
    const btns = container.querySelectorAll("button");
    const callBtn = btns[0];
    expect(callBtn.disabled).toBe(true);
    cleanup();
  });

  it("calls onCall when call button is clicked", () => {
    const props = makeProps();
    const { container, cleanup } = renderComponent(props);
    act(() => {
      container.querySelector("button").click();
    });
    expect(props.onCall).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("shows Copy Calldata and Share URL buttons when selectedFunction is set", () => {
    const { container, cleanup } = renderComponent(makeProps());
    expect(container.textContent).toMatch(/copy calldata/i);
    expect(container.textContent).toMatch(/share url/i);
    cleanup();
  });

  it("hides Copy Calldata and Share URL buttons when selectedFunction is empty", () => {
    const { container, cleanup } = renderComponent(
      makeProps({ selectedFunction: "" }),
    );
    expect(container.textContent).not.toMatch(/copy calldata/i);
    expect(container.textContent).not.toMatch(/share url/i);
    cleanup();
  });

  it("shows Copied! feedback when calldataCopied is true", () => {
    const { container, cleanup } = renderComponent(
      makeProps({ calldataCopied: true }),
    );
    const btns = Array.from(container.querySelectorAll("button"));
    const copied = btns.filter((b) => b.textContent.trim() === "Copied!");
    expect(copied.length).toBeGreaterThanOrEqual(1);
    cleanup();
  });

  it("shows Copied! feedback when urlCopied is true", () => {
    const { container, cleanup } = renderComponent(
      makeProps({ urlCopied: true }),
    );
    const btns = Array.from(container.querySelectorAll("button"));
    const copied = btns.filter((b) => b.textContent.trim() === "Copied!");
    expect(copied.length).toBeGreaterThanOrEqual(1);
    cleanup();
  });

  it("calls onCopyCalldata when Copy Calldata is clicked", () => {
    const props = makeProps();
    const { container, cleanup } = renderComponent(props);
    const btns = Array.from(container.querySelectorAll("button"));
    const calldataBtn = btns.find((b) => /copy calldata/i.test(b.textContent));
    act(() => {
      calldataBtn.click();
    });
    expect(props.onCopyCalldata).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("calls onShareUrl when Share URL is clicked", () => {
    const props = makeProps();
    const { container, cleanup } = renderComponent(props);
    const btns = Array.from(container.querySelectorAll("button"));
    const shareBtn = btns.find((b) => /share url/i.test(b.textContent));
    act(() => {
      shareBtn.click();
    });
    expect(props.onShareUrl).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("hides buttons when activeTab is not functions", () => {
    const { container, cleanup } = renderComponent(
      makeProps({ activeTab: "events" }),
    );
    expect(container.textContent).not.toMatch(/call contract/i);
    expect(container.textContent).not.toMatch(/copy calldata/i);
    cleanup();
  });

  it("shows Cancel button when simProgress is set", () => {
    const { container, cleanup } = renderComponent(
      makeProps({ simProgress: 42 }),
    );
    const btns = Array.from(container.querySelectorAll("button"));
    const cancelBtn = btns.find((b) => /cancel/i.test(b.textContent));
    expect(cancelBtn).toBeTruthy();
    cleanup();
  });

  it("shows Cancel button while a write simulation is loading without progress", () => {
    const { container, cleanup } = renderComponent(
      makeProps({ isWrite: true, loading: true, simProgress: null }),
    );
    const btns = Array.from(container.querySelectorAll("button"));
    const cancelBtn = btns.find((b) => /cancel/i.test(b.textContent));
    expect(cancelBtn).toBeTruthy();
    cleanup();
  });

  it("calls onCancel when Cancel is clicked", () => {
    const props = makeProps({ simProgress: 50 });
    const { container, cleanup } = renderComponent(props);
    const btns = Array.from(container.querySelectorAll("button"));
    const cancelBtn = btns.find((b) => /cancel/i.test(b.textContent));
    act(() => {
      cancelBtn.click();
    });
    expect(props.onCancel).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("shows progress bar label when simProgress is non-null", () => {
    const { container, cleanup } = renderComponent(
      makeProps({ simProgress: 60 }),
    );
    expect(container.textContent).toMatch(/60%/);
    cleanup();
  });

  it("shows Finalizing… when simProgress is 100", () => {
    const { container, cleanup } = renderComponent(
      makeProps({ simProgress: 100 }),
    );
    expect(container.textContent).toMatch(/finalizing/i);
    cleanup();
  });

  it("does not show progress bar when simProgress is null", () => {
    const { container, cleanup } = renderComponent(
      makeProps({ simProgress: null }),
    );
    expect(container.textContent).not.toMatch(/simulating.*%/i);
    cleanup();
  });

  it("shows session banner with Start Session when useLocalSimulation is true", () => {
    const { container, cleanup } = renderComponent(
      makeProps({ useLocalSimulation: true }),
    );
    const btns = Array.from(container.querySelectorAll("button"));
    const startBtn = btns.find((b) => /start session/i.test(b.textContent));
    expect(startBtn).toBeTruthy();
    cleanup();
  });

  it("shows Starting... when sessionStarting is true", () => {
    const { container, cleanup } = renderComponent(
      makeProps({ useLocalSimulation: true, sessionStarting: true }),
    );
    expect(container.textContent).toMatch(/starting/i);
    cleanup();
  });

  it("shows session active info with block number when sessionActive is true", () => {
    const { container, cleanup } = renderComponent(
      makeProps({
        useLocalSimulation: true,
        sessionActive: true,
        sessionBlock: 21000000,
      }),
    );
    expect(container.textContent).toMatch(/session active/i);
    expect(container.textContent).toMatch(/21000000/);
    const btns = Array.from(container.querySelectorAll("button"));
    const resetBtn = btns.find((b) => /reset/i.test(b.textContent));
    expect(resetBtn).toBeTruthy();
    cleanup();
  });

  it("calls onStartSession when Start Session is clicked", () => {
    const props = makeProps({ useLocalSimulation: true });
    const { container, cleanup } = renderComponent(props);
    const btns = Array.from(container.querySelectorAll("button"));
    const startBtn = btns.find((b) => /start session/i.test(b.textContent));
    act(() => {
      startBtn.click();
    });
    expect(props.onStartSession).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("calls onResetSession when Reset is clicked", () => {
    const props = makeProps({
      useLocalSimulation: true,
      sessionActive: true,
      sessionBlock: 100,
    });
    const { container, cleanup } = renderComponent(props);
    const btns = Array.from(container.querySelectorAll("button"));
    const resetBtn = btns.find((b) => /reset/i.test(b.textContent));
    act(() => {
      resetBtn.click();
    });
    expect(props.onResetSession).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("hides session banner when useLocalSimulation is false", () => {
    const { container, cleanup } = renderComponent(
      makeProps({ useLocalSimulation: false }),
    );
    expect(container.textContent).not.toMatch(/start session/i);
    cleanup();
  });

  it("shows L mode tag when useLocalSimulation is true and isWrite is true", () => {
    const { container, cleanup } = renderComponent(
      makeProps({ useLocalSimulation: true, isWrite: true }),
    );
    expect(container.textContent).toContain("L");
    cleanup();
  });

  it("shows T mode tag when useLocalSimulation is false and isWrite is true", () => {
    const { container, cleanup } = renderComponent(
      makeProps({ useLocalSimulation: false, isWrite: true }),
    );
    expect(container.textContent).toContain("T");
    cleanup();
  });
});
