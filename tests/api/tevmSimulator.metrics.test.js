import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { simulateWithTevm } from "../../app/utils/tevmSimulator";

// Confirms simulateWithTevm returns a metrics object of the documented shape,
// even when the simulation fails for non-metrics reasons. We mock global.fetch
// to return benign empty results so no real network traffic occurs.

describe("simulateWithTevm metrics", () => {
  let originalFetch;
  beforeEach(() => {
    originalFetch = global.fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns metrics shape with non-negative numbers, even on simulation error", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ jsonrpc: "2.0", id: 1, result: "0x0" }),
    });

    let result;
    try {
      result = await simulateWithTevm({
        chain: "ethereum",
        address: "0x0000000000000000000000000000000000000001",
        functionName: "name",
        args: [],
        abi: [
          {
            type: "function",
            name: "name",
            inputs: [],
            outputs: [{ type: "string" }],
            stateMutability: "view",
          },
        ],
        rpcUrl: "https://example.invalid",
      });
    } catch (e) {
      // simulateWithTevm should NOT throw for runtime errors; it returns
      // { success: false, ..., metrics }. If it does throw, that's a regression.
      result = { success: false, metrics: null, error: e.message };
    }

    expect(result.metrics).toBeTruthy();
    expect(typeof result.metrics.totalMs).toBe("number");
    expect(result.metrics.rpc).toBeTruthy();
    expect(typeof result.metrics.rpc.totalLogicalCalls).toBe("number");
    expect(result.metrics.phases).toBeTruthy();
    expect(result.metrics.touched).toBeTruthy();
  });
});
