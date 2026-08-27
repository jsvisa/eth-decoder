import { describe, it, expect } from "vitest";
import { mapWithConcurrency } from "../../app/utils/fetchContract";

describe("mapWithConcurrency", () => {
  it("maps all items preserving input order", async () => {
    const items = [1, 2, 3, 4, 5];
    const out = await mapWithConcurrency(items, 3, async (n) => n * 10);
    expect(out).toEqual([10, 20, 30, 40, 50]);
  });

  it("never exceeds the concurrency limit", async () => {
    let inFlight = 0;
    let peak = 0;
    const items = Array.from({ length: 12 }, (_, i) => i);
    await mapWithConcurrency(items, 4, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, Math.random() * 5));
      inFlight--;
    });
    expect(peak).toBeLessThanOrEqual(4);
  });

  it("actually runs tasks concurrently", async () => {
    let peak = 0;
    let inFlight = 0;
    const release = [];
    const items = [0, 1, 2, 3];
    const done = mapWithConcurrency(items, 4, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => release.push(resolve));
      inFlight--;
    });
    // Wait until all four gates are registered, then release them
    while (release.length < items.length) {
      await new Promise((r) => setTimeout(r, 1));
    }
    release.forEach((fn) => fn());
    await done;
    expect(peak).toBe(items.length);
  });

  it("propagates mapper errors", async () => {
    await expect(
      mapWithConcurrency([1], 1, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });

  it("handles an empty list", async () => {
    const out = await mapWithConcurrency([], 4, async (x) => x);
    expect(out).toEqual([]);
  });
});
