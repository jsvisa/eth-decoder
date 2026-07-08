import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSimulationOptions } from "../../../app/contract-caller/hooks/useSimulationOptions.js";

describe("useSimulationOptions – initial state", () => {
  it("returns correct defaults on first render", () => {
    const { result } = renderHook(() => useSimulationOptions());

    expect(result.current.fromAddress).toBe("");
    expect(result.current.forkBlockNumber).toBe("");
    expect(result.current.cheatcodes).toEqual({
      deal: { enabled: false, address: "", amount: "" },
      prank: { enabled: false, address: "" },
      warp: { enabled: false, timestamp: "" },
    });
    expect(result.current.balanceOverrides).toEqual([]);
    expect(result.current.storageOverrides).toEqual([]);
    expect(result.current.simOptionsExpanded).toBe(false);
    expect(typeof result.current.resetWriteOptions).toBe("function");
  });
});

describe("useSimulationOptions – happy path", () => {
  it("updates each state var via its setter", () => {
    const { result } = renderHook(() => useSimulationOptions());

    act(() => {
      result.current.setFromAddress(
        "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      );
    });
    expect(result.current.fromAddress).toBe(
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    );

    act(() => {
      result.current.setForkBlockNumber("19000000");
    });
    expect(result.current.forkBlockNumber).toBe("19000000");

    act(() => {
      result.current.setSimOptionsExpanded(true);
    });
    expect(result.current.simOptionsExpanded).toBe(true);

    // Enable deal cheatcode
    act(() => {
      result.current.setCheatcodes((prev) => ({
        ...prev,
        deal: { enabled: true, address: "0xabc", amount: "10" },
      }));
    });
    expect(result.current.cheatcodes.deal.enabled).toBe(true);
    expect(result.current.cheatcodes.deal.address).toBe("0xabc");
    expect(result.current.cheatcodes.deal.amount).toBe("10");
    // Other cheatcodes are untouched
    expect(result.current.cheatcodes.prank.enabled).toBe(false);
    expect(result.current.cheatcodes.warp.enabled).toBe(false);

    act(() => {
      result.current.setBalanceOverrides([
        { address: "0xabc", balance: "1.5" },
      ]);
    });
    expect(result.current.balanceOverrides).toEqual([
      { address: "0xabc", balance: "1.5" },
    ]);

    act(() => {
      result.current.setStorageOverrides([
        { address: "0xdef", slot: "0x0", value: "0x1" },
      ]);
    });
    expect(result.current.storageOverrides).toEqual([
      { address: "0xdef", slot: "0x0", value: "0x1" },
    ]);
  });
});

describe("useSimulationOptions – resetWriteOptions", () => {
  it("resets all state vars back to their initial defaults", () => {
    const { result } = renderHook(() => useSimulationOptions());

    // Mutate everything
    act(() => {
      result.current.setFromAddress(
        "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      );
      result.current.setForkBlockNumber("18000000");
      result.current.setSimOptionsExpanded(true);
      result.current.setBalanceOverrides([{ address: "0x1", balance: "5" }]);
      result.current.setStorageOverrides([
        { address: "0x2", slot: "0x1", value: "0xff" },
      ]);
      result.current.setCheatcodes({
        deal: { enabled: true, address: "0x3", amount: "1" },
        prank: { enabled: true, address: "0x4" },
        warp: { enabled: true, timestamp: "12345" },
      });
    });

    // Verify they were set
    expect(result.current.fromAddress).not.toBe("");
    expect(result.current.balanceOverrides).toHaveLength(1);

    // Reset
    act(() => {
      result.current.resetWriteOptions();
    });

    expect(result.current.fromAddress).toBe("");
    expect(result.current.forkBlockNumber).toBe("");
    expect(result.current.cheatcodes).toEqual({
      deal: { enabled: false, address: "", amount: "" },
      prank: { enabled: false, address: "" },
      warp: { enabled: false, timestamp: "" },
    });
    expect(result.current.balanceOverrides).toEqual([]);
    expect(result.current.storageOverrides).toEqual([]);
    expect(result.current.simOptionsExpanded).toBe(false);
  });

  it("is idempotent when called on already-default state", () => {
    const { result } = renderHook(() => useSimulationOptions());

    act(() => {
      result.current.resetWriteOptions();
    });

    expect(result.current.fromAddress).toBe("");
    expect(result.current.forkBlockNumber).toBe("");
    expect(result.current.cheatcodes).toEqual({
      deal: { enabled: false, address: "", amount: "" },
      prank: { enabled: false, address: "" },
      warp: { enabled: false, timestamp: "" },
    });
    expect(result.current.balanceOverrides).toEqual([]);
    expect(result.current.storageOverrides).toEqual([]);
    expect(result.current.simOptionsExpanded).toBe(false);
  });
});
