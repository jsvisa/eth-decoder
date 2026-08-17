import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, renderHook, cleanup } from "@testing-library/react";
import { useTabState } from "../../app/components/useTabState.js";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("useTabState", () => {
  it("returns the initial value until persisted state loads, then loaded=true", () => {
    localStorage.setItem(
      "evm_workspace_tabs_state",
      JSON.stringify({ "tab-1": { inputData: "0x1234" } }),
    );
    const { result } = renderHook(() =>
      useTabState({ tabId: "tab-1", initial: { inputData: "" } }),
    );
    expect(result.current[0]).toEqual({ inputData: "0x1234" });
    expect(result.current[2]).toBe(true);
  });

  it("keeps initial value when nothing is persisted", () => {
    const { result } = renderHook(() =>
      useTabState({ tabId: "tab-1", initial: { inputData: "" } }),
    );
    expect(result.current[0]).toEqual({ inputData: "" });
    expect(result.current[2]).toBe(true);
  });

  it("persists state changes under the tab's key", () => {
    const { result } = renderHook(() =>
      useTabState({ tabId: "tab-1", initial: { inputData: "" } }),
    );
    act(() => {
      result.current[1]({ inputData: "0xdeadbeef" });
    });
    const stored = JSON.parse(localStorage.getItem("evm_workspace_tabs_state"));
    expect(stored["tab-1"]).toEqual({ inputData: "0xdeadbeef" });
  });

  it("keeps tab state isolated per tabId", () => {
    const { result: r1 } = renderHook(() =>
      useTabState({ tabId: "tab-1", initial: { n: 1 } }),
    );
    const { result: _r2 } = renderHook(() =>
      useTabState({ tabId: "tab-2", initial: { n: 2 } }),
    );
    act(() => {
      r1.current[1]({ n: 99 });
    });
    const stored = JSON.parse(localStorage.getItem("evm_workspace_tabs_state"));
    expect(stored["tab-1"]).toEqual({ n: 99 });
    expect(stored["tab-2"]).toEqual({ n: 2 });
  });
});
