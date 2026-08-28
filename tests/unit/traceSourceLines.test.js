import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../app/utils/sourcify.js", () => ({
  fetchContractOutput: vi.fn(),
}));

import { fetchContractOutput } from "../../app/utils/sourcify.js";
import {
  stripPcsFromTrace,
  resolveTraceSourceLinesForSave,
} from "../../app/utils/traceSourceLines.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("stripPcsFromTrace", () => {
  it("removes pcs from a node", () => {
    const node = { pcs: [1, 2, 3], calls: [] };
    stripPcsFromTrace(node);
    expect(node.pcs).toBeUndefined();
  });

  it("removes pcs recursively", () => {
    const node = {
      pcs: [1],
      calls: [{ pcs: [2], calls: [{ pcs: [3], calls: [] }] }],
    };
    stripPcsFromTrace(node);
    expect(node.pcs).toBeUndefined();
    expect(node.calls[0].pcs).toBeUndefined();
    expect(node.calls[0].calls[0].pcs).toBeUndefined();
  });

  it("leaves other fields untouched", () => {
    const node = { pcs: [1], to: "0xabc", calls: [{ to: "0xdef" }] };
    stripPcsFromTrace(node);
    expect(node.to).toBe("0xabc");
    expect(node.calls[0].to).toBe("0xdef");
  });

  it("handles null and nodes without pcs/calls", () => {
    expect(() => stripPcsFromTrace(null)).not.toThrow();
    expect(() => stripPcsFromTrace({})).not.toThrow();
  });
});

describe("resolveTraceSourceLinesForSave", () => {
  const ADDR = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  // sourceMap: pc0 -> line 0 file 0, pc1 -> line 2 file 0, pc2 -> line 5 file 1
  const SOURCE_MAP = "0:0:0:-:0;1:2:0:-:0;2:5:1:-:0";
  const SOURCES = { "a.sol": "line1\nline2", "b.sol": "x" };

  it("sets sourceLines and sourceFile per node using its own address map", async () => {
    fetchContractOutput.mockResolvedValue({
      sourceMap: SOURCE_MAP,
      sources: SOURCES,
    });
    const trace = {
      to: ADDR,
      pcs: [0, 1],
      calls: [
        {
          to: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          pcs: [2],
          calls: [],
        },
      ],
    };
    await resolveTraceSourceLinesForSave(trace, 1);
    expect(fetchContractOutput).toHaveBeenCalledWith(ADDR, 1);
    expect(trace.sourceLines).toEqual([1, 3]);
    expect(trace.sourceFile).toBe("a.sol");
    expect(trace.calls[0].sourceLines).toEqual([6]);
    expect(trace.calls[0].sourceFile).toBe("b.sol");
  });

  it("uses the lowercase address for the lookup", async () => {
    fetchContractOutput.mockResolvedValue({
      sourceMap: SOURCE_MAP,
      sources: SOURCES,
    });
    const trace = { to: ADDR.toUpperCase(), pcs: [0], calls: [] };
    await resolveTraceSourceLinesForSave(trace, 1);
    expect(trace.sourceLines).toEqual([1]);
  });

  it("leaves nodes unmapped when Sourcify has no output", async () => {
    fetchContractOutput.mockResolvedValue(null);
    const trace = { to: ADDR, pcs: [0, 1], calls: [] };
    await resolveTraceSourceLinesForSave(trace, 1);
    expect(trace.sourceLines).toBeUndefined();
    expect(trace.sourceFile).toBeUndefined();
  });

  it("skips nodes without pcs or address", async () => {
    fetchContractOutput.mockResolvedValue({
      sourceMap: SOURCE_MAP,
      sources: SOURCES,
    });
    const trace = {
      to: ADDR,
      pcs: [],
      calls: [{ to: null, pcs: [0], calls: [] }],
    };
    await resolveTraceSourceLinesForSave(trace, 1);
    expect(trace.sourceLines).toBeUndefined();
    expect(trace.calls[0].sourceLines).toBeUndefined();
  });

  it("reuses the shared cache across calls", async () => {
    fetchContractOutput.mockResolvedValue({
      sourceMap: SOURCE_MAP,
      sources: SOURCES,
    });
    const cache = new Map();
    await resolveTraceSourceLinesForSave(
      { to: ADDR, pcs: [0], calls: [] },
      1,
      cache,
    );
    await resolveTraceSourceLinesForSave(
      { to: ADDR, pcs: [1], calls: [] },
      1,
      cache,
    );
    expect(fetchContractOutput).toHaveBeenCalledTimes(1);
  });

  it("returns early for a null trace", async () => {
    await resolveTraceSourceLinesForSave(null, 1);
    expect(fetchContractOutput).not.toHaveBeenCalled();
  });
});
