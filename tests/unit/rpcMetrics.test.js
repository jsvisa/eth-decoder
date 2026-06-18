import { describe, it, expect, vi } from "vitest";
import { createMetricsCollector } from "../../app/utils/rpcMetrics";

describe("createMetricsCollector", () => {
  it("returns an object with start/end/snapshot/wrap/markPhase methods", () => {
    const collector = createMetricsCollector({ batchSize: 1 });
    expect(typeof collector.start).toBe("function");
    expect(typeof collector.end).toBe("function");
    expect(typeof collector.snapshot).toBe("function");
    expect(typeof collector.wrap).toBe("function");
    expect(typeof collector.markPhase).toBe("function");
  });

  it("snapshot() before any calls returns zeroed metrics", () => {
    const c = createMetricsCollector({ batchSize: 1 });
    c.start();
    c.end();
    const m = c.snapshot();
    expect(m.totalMs).toBeGreaterThanOrEqual(0);
    expect(m.rpc.totalLogicalCalls).toBe(0);
    expect(m.rpc.totalHttpCalls).toBe(0);
    expect(m.rpc.duplicates).toBe(0);
    expect(m.rpc.byMethod).toEqual({});
    expect(m.touched.addresses).toBe(0);
    expect(m.touched.slots).toBe(0);
    expect(m.phases.prefetchMs).toBe(0);
    expect(m.phases.executionMs).toBe(0);
    expect(m.phases.lazyLoadMs).toBe(0);
  });
});

describe("collector.wrap()", () => {
  it("counts one logical call per request and accumulates byMethod", async () => {
    const c = createMetricsCollector({ batchSize: 1 });
    c.start();
    const factory = () => ({
      request: async ({ method }) => {
        if (method === "eth_getCode") return "0xdead";
        if (method === "eth_getBalance") return "0x1";
        return null;
      },
    });
    const wrapped = c.wrap(factory)({});
    await wrapped.request({
      method: "eth_getCode",
      params: ["0xAbC", "latest"],
    });
    await wrapped.request({
      method: "eth_getCode",
      params: ["0xAbC", "latest"],
    });
    await wrapped.request({
      method: "eth_getBalance",
      params: ["0xAbC", "latest"],
    });
    c.end();
    const m = c.snapshot();
    expect(m.rpc.totalLogicalCalls).toBe(3);
    expect(m.rpc.byMethod.eth_getCode.count).toBe(2);
    expect(m.rpc.byMethod.eth_getBalance.count).toBe(1);
    expect(m.rpc.duplicates).toBe(1);
    expect(m.touched.addresses).toBe(1);
  });

  it("counts unique storage slots", async () => {
    const c = createMetricsCollector({ batchSize: 1 });
    c.start();
    const wrapped = c.wrap(() => ({ request: async () => "0x0" }))({});
    await wrapped.request({
      method: "eth_getStorageAt",
      params: ["0xa", "0x1", "latest"],
    });
    await wrapped.request({
      method: "eth_getStorageAt",
      params: ["0xa", "0x2", "latest"],
    });
    await wrapped.request({
      method: "eth_getStorageAt",
      params: ["0xb", "0x1", "latest"],
    });
    c.end();
    const m = c.snapshot();
    expect(m.touched.addresses).toBe(2);
    expect(m.touched.slots).toBe(3);
  });

  it("propagates errors from the inner transport", async () => {
    const c = createMetricsCollector({ batchSize: 1 });
    c.start();
    const wrapped = c.wrap(() => ({
      request: async () => {
        throw new Error("rpc fail");
      },
    }))({});
    await expect(
      wrapped.request({ method: "eth_getCode", params: ["0x1", "latest"] }),
    ).rejects.toThrow("rpc fail");
    c.end();
    expect(c.snapshot().rpc.byMethod.eth_getCode.count).toBe(1);
  });
});

describe("collector.markPhase()", () => {
  it("computes prefetch and execution durations from marks", async () => {
    const c = createMetricsCollector({ batchSize: 1 });
    c.start();
    c.markPhase("prefetch", "start");
    await new Promise((r) => setTimeout(r, 10));
    c.markPhase("prefetch", "end");
    c.markPhase("execution", "start");
    await new Promise((r) => setTimeout(r, 10));
    c.markPhase("execution", "end");
    c.end();
    const m = c.snapshot();
    expect(m.phases.prefetchMs).toBeGreaterThan(0);
    expect(m.phases.executionMs).toBeGreaterThan(0);
  });

  it("attributes RPC time during execution window to lazyLoadMs", async () => {
    const c = createMetricsCollector({ batchSize: 1 });
    c.start();
    c.markPhase("execution", "start");
    const wrapped = c.wrap(() => ({
      request: async () => {
        await new Promise((r) => setTimeout(r, 5));
        return "0x0";
      },
    }))({});
    await wrapped.request({ method: "eth_getCode", params: ["0xa", "latest"] });
    c.markPhase("execution", "end");
    c.end();
    expect(c.snapshot().phases.lazyLoadMs).toBeGreaterThan(0);
  });
});
