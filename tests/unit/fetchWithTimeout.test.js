import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchWithTimeout", () => {
  it("passes an abort signal by default", async () => {
    const { fetchWithTimeout } =
      await import("../../app/utils/fetchWithTimeout.js");
    global.fetch.mockResolvedValue({ ok: true });
    await fetchWithTimeout("https://example.test/api");
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe("https://example.test/api");
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.signal.aborted).toBe(false);
  });

  it("does not override a caller-provided signal", async () => {
    const { fetchWithTimeout } =
      await import("../../app/utils/fetchWithTimeout.js");
    global.fetch.mockResolvedValue({ ok: true });
    const controller = new AbortController();
    await fetchWithTimeout("https://example.test/api", {
      method: "POST",
      body: "{}",
      signal: controller.signal,
    });
    expect(global.fetch.mock.calls[0][1].signal).toBe(controller.signal);
    expect(global.fetch.mock.calls[0][1].method).toBe("POST");
  });

  it("aborts the request after the timeout elapses", async () => {
    vi.useFakeTimers();
    try {
      const { fetchWithTimeout } =
        await import("../../app/utils/fetchWithTimeout.js");
      global.fetch.mockImplementation(
        (_url, options) =>
          new Promise((_resolve, reject) => {
            options.signal.addEventListener("abort", () => {
              reject(new Error("The operation was aborted"));
            });
          }),
      );
      const promise = fetchWithTimeout("https://slow.test", {}, 50);
      await vi.advanceTimersByTimeAsync(60);
      await expect(promise).rejects.toThrow(/abort/i);
    } finally {
      vi.useRealTimers();
    }
  });
});
