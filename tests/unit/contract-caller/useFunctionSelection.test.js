import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFunctionSelection } from "../../../app/contract-caller/hooks/useFunctionSelection.js";

// Mock navigator.clipboard (jsdom doesn't implement it)
beforeEach(() => {
  vi.stubGlobal("navigator", {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
  localStorage.clear();
});

// Minimal ABI for testing: one view function with one uint256 input
const SIMPLE_ABI = [
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
];

// ABI entry for a payable function to test calldata encode/decode
const TRANSFER_ABI = [
  {
    type: "function",
    name: "transfer",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
];

const ADDRESS_ARRAY_ABI = [
  {
    type: "function",
    name: "setOwners",
    inputs: [{ name: "owners", type: "address[]" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
];

const TUPLE_ARRAY_ABI = [
  {
    type: "function",
    name: "executeRoute",
    inputs: [
      {
        name: "route",
        type: "tuple[]",
        components: [
          { name: "target", type: "address" },
          { name: "value", type: "uint256" },
          { name: "data", type: "bytes" },
        ],
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
];

describe("useFunctionSelection — initial state", () => {
  it("starts with empty / default values", () => {
    const { result } = renderHook(() =>
      useFunctionSelection({ parsedAbi: null, functions: [], address: "" }),
    );

    expect(result.current.selectedFunction).toBe("");
    expect(result.current.args).toEqual([]);
    expect(result.current.functionFilter).toBe("");
    expect(result.current.showFunctionList).toBe(false);
    expect(result.current.fieldErrors).toEqual({});
    expect(result.current.pasteCalldataExpanded).toBe(false);
    expect(result.current.pasteCalldataValue).toBe("");
    expect(result.current.pasteCalldataError).toBeNull();
    expect(result.current.ethValue).toBe("");
    expect(result.current.ethValueUnit).toBe("ETH");
    expect(result.current.readBlockNumber).toBe("");
    expect(result.current.copiedItem).toBeNull();
    expect(result.current.calldataCopied).toBe(false);
  });

  it("exposes all required return values", () => {
    const { result } = renderHook(() => useFunctionSelection());

    const required = [
      "selectedFunction",
      "setSelectedFunction",
      "args",
      "setArgs",
      "fieldErrors",
      "setFieldErrors",
      "functionFilter",
      "setFunctionFilter",
      "showFunctionList",
      "setShowFunctionList",
      "pasteCalldataExpanded",
      "setPasteCalldataExpanded",
      "pasteCalldataValue",
      "setPasteCalldataValue",
      "pasteCalldataError",
      "setPasteCalldataError",
      "ethValue",
      "setEthValue",
      "ethValueUnit",
      "setEthValueUnit",
      "readBlockNumber",
      "setReadBlockNumber",
      "calldataCopied",
      "copiedItem",
      "setCopiedItem",
      "handleDecodeAndFill",
      "handleCopyCalldata",
      "applyPendingArgs",
    ];

    for (const key of required) {
      expect(result.current).toHaveProperty(key);
    }
  });
});

describe("useFunctionSelection — function selection and arg reset", () => {
  it("resets args to defaults when a new function is selected", () => {
    const { result } = renderHook(() =>
      useFunctionSelection({
        parsedAbi: SIMPLE_ABI,
        functions: SIMPLE_ABI,
        address: "0x1234567890123456789012345678901234567890",
      }),
    );

    act(() => {
      result.current.setSelectedFunction("balanceOf(address)");
    });

    // balanceOf has one address input, default value is empty string
    expect(result.current.args).toEqual([""]);
  });

  it("encodes calldata automatically when function and args are set", async () => {
    const { result } = renderHook(() =>
      useFunctionSelection({
        parsedAbi: TRANSFER_ABI,
        functions: TRANSFER_ABI,
        address: "0x1234567890123456789012345678901234567890",
      }),
    );

    act(() => {
      result.current.setSelectedFunction("transfer(address,uint256)");
    });

    act(() => {
      result.current.setArgs([
        "0x0000000000000000000000000000000000000001",
        "1000",
      ]);
    });

    // After setting valid args, pasteCalldataValue should be a hex calldata string
    // Allow one render cycle for the effect to fire
    await act(async () => {});

    expect(result.current.pasteCalldataValue).toMatch(/^0x[0-9a-f]+$/i);
    // transfer(address,uint256) selector is 0xa9059cbb
    expect(result.current.pasteCalldataValue.slice(0, 10)).toBe("0xa9059cbb");
  });

  it("encodes comma-separated address array calldata", async () => {
    const { result } = renderHook(() =>
      useFunctionSelection({
        parsedAbi: ADDRESS_ARRAY_ABI,
        functions: ADDRESS_ARRAY_ABI,
        address: "0x1234567890123456789012345678901234567890",
      }),
    );

    act(() => {
      result.current.setSelectedFunction("setOwners(address[])");
    });

    act(() => {
      result.current.setArgs([
        "0x0000000000000000000000000000000000000001,0x0000000000000000000000000000000000000002",
      ]);
    });

    await act(async () => {});

    await act(async () => {
      await result.current.handleCopyCalldata();
    });

    expect(result.current.pasteCalldataValue).toMatch(/^0x[0-9a-f]+$/i);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      result.current.pasteCalldataValue,
    );
  });

  it("copies calldata when args contain structured tuple arrays", async () => {
    const { result } = renderHook(() =>
      useFunctionSelection({
        parsedAbi: TUPLE_ARRAY_ABI,
        functions: TUPLE_ARRAY_ABI,
        address: "0x1234567890123456789012345678901234567890",
      }),
    );

    act(() => {
      result.current.setSelectedFunction("executeRoute(tuple[])");
    });

    act(() => {
      result.current.setArgs([
        [["0x0000000000000000000000000000000000000001", "25", "0xabcdef"]],
      ]);
    });

    await act(async () => {});

    await act(async () => {
      await result.current.handleCopyCalldata();
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      result.current.pasteCalldataValue,
    );
    expect(result.current.pasteCalldataValue).toMatch(/^0x[0-9a-f]+$/i);
  });

  it("clears stale selected function state when parsed ABI disappears", () => {
    const { result, rerender } = renderHook(
      ({ parsedAbi, functions }) =>
        useFunctionSelection({
          parsedAbi,
          functions,
          address: "0x1234567890123456789012345678901234567890",
        }),
      {
        initialProps: {
          parsedAbi: TRANSFER_ABI,
          functions: TRANSFER_ABI,
        },
      },
    );

    act(() => {
      result.current.setSelectedFunction("transfer(address,uint256)");
    });

    rerender({ parsedAbi: null, functions: [] });

    expect(result.current.selectedFunction).toBe("");
    expect(result.current.args).toEqual([]);
    expect(result.current.pasteCalldataValue).toBe("");
  });
});

describe("useFunctionSelection — handleDecodeAndFill", () => {
  it("sets error for invalid calldata", () => {
    const { result } = renderHook(() =>
      useFunctionSelection({
        parsedAbi: TRANSFER_ABI,
        functions: TRANSFER_ABI,
        address: "",
      }),
    );

    act(() => {
      result.current.setPasteCalldataValue("not-valid");
    });

    act(() => {
      result.current.handleDecodeAndFill();
    });

    expect(result.current.pasteCalldataError).toBeTruthy();
  });

  it("sets error when selector does not match any ABI function", () => {
    const { result } = renderHook(() =>
      useFunctionSelection({
        parsedAbi: TRANSFER_ABI,
        functions: TRANSFER_ABI,
        address: "",
      }),
    );

    // Well-formed hex but unknown selector
    act(() => {
      result.current.setPasteCalldataValue("0xdeadbeef" + "00".repeat(32));
    });

    act(() => {
      result.current.handleDecodeAndFill();
    });

    expect(result.current.pasteCalldataError).toBe(
      "No matching function found in ABI",
    );
  });

  it("decodes valid calldata and fills args", async () => {
    // Encode a known call first using viem directly
    const { encodeFunctionData } = await import("viem");
    const calldata = encodeFunctionData({
      abi: TRANSFER_ABI,
      functionName: "transfer",
      args: ["0x0000000000000000000000000000000000000002", 500n],
    });

    const { result } = renderHook(() =>
      useFunctionSelection({
        parsedAbi: TRANSFER_ABI,
        functions: TRANSFER_ABI,
        address: "",
      }),
    );

    // First select the function so it's already selected
    act(() => {
      result.current.setSelectedFunction("transfer(address,uint256)");
    });

    act(() => {
      result.current.setPasteCalldataValue(calldata);
    });

    act(() => {
      result.current.handleDecodeAndFill();
    });

    expect(result.current.pasteCalldataError).toBeNull();
    expect(result.current.args[0]).toBe(
      "0x0000000000000000000000000000000000000002",
    );
    expect(result.current.args[1]).toBe("500");
  });
});

describe("useFunctionSelection — applyPendingArgs", () => {
  it("sets the selected function and pending args via applyPendingArgs", () => {
    const { result } = renderHook(() =>
      useFunctionSelection({
        parsedAbi: TRANSFER_ABI,
        functions: TRANSFER_ABI,
        address: "0xabc",
      }),
    );

    act(() => {
      result.current.applyPendingArgs({
        functionSig: "transfer(address,uint256)",
        args: ["0x0000000000000000000000000000000000000003", "42"],
      });
    });

    // selectedFunction should be set immediately
    expect(result.current.selectedFunction).toBe("transfer(address,uint256)");
    // After the effect fires (pending args match), args should be applied
    expect(result.current.args).toEqual([
      "0x0000000000000000000000000000000000000003",
      "42",
    ]);
  });

  it("resolves legacy function-name pending selections to canonical signatures", () => {
    const { result } = renderHook(() =>
      useFunctionSelection({
        parsedAbi: TRANSFER_ABI,
        functions: TRANSFER_ABI,
        address: "0xabc",
      }),
    );

    act(() => {
      result.current.applyPendingArgs({
        functionSig: "transfer",
        args: ["0x0000000000000000000000000000000000000004", "7"],
      });
    });

    expect(result.current.selectedFunction).toBe("transfer(address,uint256)");
    expect(result.current.args).toEqual([
      "0x0000000000000000000000000000000000000004",
      "7",
    ]);
  });
});
